// 5kl-backend/controllers/orderController.js
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Product = require('../models/Product');
const AppError = require('../utils/appError');
const Joi = require('joi');

// --- Schemas de Validation Joi ---

const createOrderSchema = Joi.object({
    shippingAddressId: Joi.string().hex().length(24).required() // L'ID d'une adresse existante de l'utilisateur
}).options({ stripUnknown: true });

// --- Fonctions des Contrôleurs ---

/**
 * @desc    Créer une nouvelle commande (processus de checkout)
 * @route   POST /api/orders
 * @access  Private (Buyer)
 */
exports.createOrder = async (req, res, next) => {
    try {
        const { error, value } = createOrderSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { shippingAddressId } = value;

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        const shippingAddress = user.addresses.id(shippingAddressId);
        if (!shippingAddress) {
            return next(new AppError('order.invalidAddressId', 400));
        }

        const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');

        if (!cart || cart.items.length === 0) {
            return next(new AppError('order.cartEmpty', 400));
        }

        let totalAmount = 0;
        const orderItems = [];
        const productsToUpdate = []; // Pour décrémenter le stock

        for (const cartItem of cart.items) {
            const product = cartItem.product;

            if (!product || !product.isAvailable || product.stock < cartItem.quantity) {
                // Si le produit n'est pas disponible ou stock insuffisant
                return next(new AppError('order.productOutOfStock', 400, [product ? product.name : 'Unknown', product ? product.stock : 0, cartItem.quantity]));
            }

            orderItems.push({
                product: product._id,
                quantity: cartItem.quantity,
                pricePaid: cartItem.priceAtAddToCart // Utiliser le prix au moment de l'ajout au panier
            });
            totalAmount += cartItem.quantity * cartItem.priceAtAddToCart;

            // Préparer la décrémentation du stock
            productsToUpdate.push({
                id: product._id,
                newStock: product.stock - cartItem.quantity
            });
        }

        // Créer la commande
        const order = await Order.create({
            user: req.user.id,
            items: orderItems,
            totalAmount: totalAmount,
            shippingAddress: {
                street: shippingAddress.street,
                city: shippingAddress.city,
                state: shippingAddress.state,
                zipCode: shippingAddress.zipCode,
                country: shippingAddress.country
            },
            status: 'pending_admin_approval', // Par défaut
            paymentMethod: 'pay_on_delivery', // Pour l'instant, seulement pay-on-delivery
            deliveryTracking: [{ status: 'pending_admin_approval' }]
        });

        // Vider le panier après la commande
        await Cart.deleteOne({ user: req.user.id });

        // Décrémenter les stocks des produits
        for (const prod of productsToUpdate) {
            await Product.findByIdAndUpdate(prod.id, { stock: prod.newStock });
        }

        // TODO: Notifier l'administrateur d'une nouvelle commande en attente
        // TODO: Notifier l'utilisateur de la création de la commande

        res.status(201).json({
            success: true,
            message: req.t('order.created'),
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les commandes de l'utilisateur connecté
 * @route   GET /api/orders
 * @access  Private (Buyer)
 */
exports.getOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ user: req.user.id })
            .populate('items.product', 'name price images shop'); // Populate les produits

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir une commande spécifique par ID pour l'utilisateur connecté
 * @route   GET /api/orders/:id
 * @access  Private (Buyer)
 */
exports.getOrderById = async (req, res, next) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user.id })
            .populate('items.product', 'name price images shop');

        if (!order) {
            return next(new AppError('order.notFound', 404));
        }

        res.status(200).json({
            success: true,
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Annuler une commande par l'utilisateur (si le statut le permet)
 * @route   PUT /api/orders/:id/cancel
 * @access  Private (Buyer)
 */
exports.cancelOrder = async (req, res, next) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user.id });

        if (!order) {
            return next(new AppError('order.notFound', 404));
        }

        // Autoriser l'annulation uniquement si la commande est en attente d'approbation ou acceptée
        if (order.status !== 'pending_admin_approval' && order.status !== 'accepted') {
            return next(new AppError('order.cannotCancel', 400, [order.status]));
        }

        order.status = 'cancelled';
        order.deliveryTracking.push({ status: 'cancelled' });
        await order.save();

        // TODO: Notifier l'administrateur de l'annulation
        // TODO: Restaurer les stocks des produits si la commande avait déjà été 'accepted'
        // Si les stocks sont décrémentés à la création de la commande (comme ici),
        // ils devraient être restaurés si la commande est annulée APRÈS avoir été 'accepted'.
        // Si elle est annulée 'pending_admin_approval', ils n'ont pas encore été décrémentés (car l'admin les décrémente à l'acceptation).

        res.status(200).json({
            success: true,
            message: req.t('order.cancelled'),
            data: order,
        });
    } catch (error) {
        next(error);
    }
};