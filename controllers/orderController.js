// 5kl-backend/controllers/orderController.js
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Product = require('../models/Product');
const CurrencyRate = require('../models/CurrencyRate'); // AJOUTÉ : Pour récupérer le taux de change
const AppError = require('../utils/appError');
const Joi = require('joi');
const { SUPPORTED_CURRENCIES } = require('../utils/i18n'); // AJOUTÉ pour la validation de devise

// --- Schemas de Validation Joi ---

const createOrderSchema = Joi.object({
    shippingAddressId: Joi.string().hex().length(24).required(),
    currency: Joi.string().valid(...SUPPORTED_CURRENCIES).default('FC').optional() // AJOUTÉ : Devise choisie par l'acheteur
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

        const { shippingAddressId, currency = 'FC' } = value; // Par défaut FC

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

        let exchangeRate = 1; // Par défaut, 1 FC = 1 FC
        if (currency === 'USD') {
            // Si la devise est USD, nous devons convertir les prix qui sont en FC (prix produit par défaut)
            const currentRateDoc = await CurrencyRate.findOne();
            if (!currentRateDoc || !currentRateDoc.USD_TO_FC_RATE) {
                return next(new AppError('admin.currencyRateNotFound', 500)); // L'admin doit définir un taux
            }
            exchangeRate = currentRateDoc.USD_TO_FC_RATE;
        }

        let totalAmount = 0;
        const orderItems = [];
        const productsToUpdate = [];

        for (const cartItem of cart.items) {
            const product = cartItem.product;

            if (!product || !product.isAvailable || product.stock < cartItem.quantity) {
                return next(new AppError('order.productOutOfStock', 400, [product ? product.name : 'Unknown', product ? product.stock : 0, cartItem.quantity]));
            }

            let priceForOrder = cartItem.priceAtAddToCart; // Prix du produit au moment de l'ajout au panier, en FC

            // Si la commande est en USD, convertir le prix payé
            if (currency === 'USD') {
                priceForOrder = priceForOrder / exchangeRate; // Convertir FC en USD
            }
             // Si la commande est en FC, le prix est déjà en FC

            orderItems.push({
                product: product._id,
                quantity: cartItem.quantity,
                pricePaid: priceForOrder // Le prix stocké sera dans la devise de la commande
            });
            totalAmount += cartItem.quantity * priceForOrder;

            productsToUpdate.push({
                id: product._id,
                newStock: product.stock - cartItem.quantity
            });
        }

        const order = await Order.create({
            user: req.user.id,
            items: orderItems,
            totalAmount: totalAmount,
            currency: currency, // Enregistrer la devise choisie
            exchangeRateUsed: exchangeRate, // Enregistrer le taux utilisé
            shippingAddress: {
                street: shippingAddress.street,
                city: shippingAddress.city,
                state: shippingAddress.state,
                zipCode: shippingAddress.zipCode,
                country: shippingAddress.country
            },
            status: 'pending_admin_approval',
            paymentMethod: 'pay_on_delivery',
            deliveryTracking: [{ status: 'pending_admin_approval' }]
        });

        await Cart.deleteOne({ user: req.user.id });

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
            .populate('items.product', 'name price images shop');

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

        if (order.status !== 'pending_admin_approval' && order.status !== 'accepted') {
            return next(new AppError('order.cannotCancel', 400, [order.status]));
        }

        order.status = 'cancelled';
        order.deliveryTracking.push({ status: 'cancelled' });
        await order.save();

        // TODO: Notifier l'administrateur de l'annulation
        // TODO: Restaurer les stocks des produits si la commande avait déjà été 'accepted'
        //       et les stocks décrémentés à l'acceptation (actuellement, stocks décrémentés à la création)
        //       Donc, si la commande est annulée, nous devons restaurer le stock.
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        }


        res.status(200).json({
            success: true,
            message: req.t('order.cancelled'),
            data: order,
        });
    } catch (error) {
        next(error);
    }
};