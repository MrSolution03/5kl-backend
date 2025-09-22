// 5kl-backend/controllers/orderController.js
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Product = require('../models/Product');
const ProductVariation = require('../models/ProductVariation');
const StockMovement = require('../models/StockMovement');
const CurrencyRate = require('../models/CurrencyRate');
const AppError = require('../utils/appError');
const { sendNotification, sendNotificationToAdmin } = require('../utils/notificationService'); // AJOUTÉ : Service de notification
const Joi = require('joi');
const { SUPPORTED_CURRENCIES } = require('../utils/i18n');


// --- Schemas de Validation Joi ---
const createOrderSchema = Joi.object({
    shippingAddressId: Joi.string().hex().length(24).required(),
    currency: Joi.string().valid(...SUPPORTED_CURRENCIES).default('FC').optional()
}).options({ stripUnknown: true });


// --- Fonctions Utilitaires pour la Devise (inchangé) ---
async function convertPrice(priceFC, targetCurrency, req) {
    if (targetCurrency === 'FC' || !targetCurrency) {
        return priceFC;
    }
    if (targetCurrency === 'USD') {
        const currencyRate = await CurrencyRate.findOne();
        if (!currencyRate || !currencyRate.USD_TO_FC_RATE) {
            const defaultRate = 2700;
            if (req && req.user && req.user.id) {
                await CurrencyRate.create({ USD_TO_FC_RATE: defaultRate, lastUpdatedBy: req.user.id });
            } else {
                console.warn('Default CurrencyRate created without user ID. Consider setting up a default admin.');
            }
            return priceFC / defaultRate;
        }
        return priceFC / currencyRate.USD_TO_FC_RATE;
    }
    throw new AppError('order.invalidCurrency', 400);
}


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

        const { shippingAddressId, currency = 'FC' } = value;

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        const shippingAddress = user.addresses.id(shippingAddressId);
        if (!shippingAddress) {
            return next(new AppError('order.invalidAddressId', 400));
        }

        const cart = await Cart.findOne({ user: req.user.id }).populate({
            path: 'items.productVariation',
            populate: { path: 'product', select: 'name' }
        });

        if (!cart || cart.items.length === 0) {
            return next(new AppError('order.cartEmpty', 400));
        }

        let exchangeRate = 1;
        if (currency === 'USD') {
            const currentRateDoc = await CurrencyRate.findOne();
            if (!currentRateDoc || !currentRateDoc.USD_TO_FC_RATE) {
                return next(new AppError('admin.currencyRateNotFound', 500));
            }
            exchangeRate = currentRateDoc.USD_TO_FC_RATE;
        }

        let totalAmount = 0;
        const orderItems = [];
        const variationsToUpdate = [];
        const stockMovementsToCreate = [];

        for (const cartItem of cart.items) {
            const variation = cartItem.productVariation;

            if (!variation || !variation.isAvailable) {
                return next(new AppError('order.productVariationNotFound', 404));
            }
            if (variation.stock < cartItem.quantity) {
                return next(new AppError('order.productOutOfStock', 400, [variation.product.name, variation.attributes.map(a => a.value).join(', '), variation.stock, cartItem.quantity]));
            }

            let priceForOrder = cartItem.priceAtAddToCart;

            if (currency === 'USD') {
                priceForOrder = priceForOrder / exchangeRate;
            }

            orderItems.push({
                product: variation.product._id,
                productVariation: variation._id,
                quantity: cartItem.quantity,
                pricePaid: priceForOrder
            });
            totalAmount += cartItem.quantity * priceForOrder;

            variationsToUpdate.push({
                id: variation._id,
                newStock: variation.stock - cartItem.quantity,
                product: variation.product._id
            });

            stockMovementsToCreate.push({
                variation: variation._id,
                product: variation.product._id,
                type: 'out',
                quantity: cartItem.quantity,
                reason: 'vente',
                // reference sera mis à jour avec l'ID de commande après création
                movedBy: req.user.id,
                currentStock: variation.stock - cartItem.quantity
            });
        }

        const order = await Order.create({
            user: req.user.id,
            items: orderItems,
            totalAmount: totalAmount,
            currency: currency,
            exchangeRateUsed: exchangeRate,
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

        for (const update of variationsToUpdate) {
            await ProductVariation.findByIdAndUpdate(update.id, { stock: update.newStock });
            await Product.findById(update.product).then(p => p.updateAggregatedData());
        }

        for (const movement of stockMovementsToCreate) {
            movement.reference = order._id.toString();
            await StockMovement.create(movement);
        }

        // AJOUTÉ : Notifications
        await sendNotificationToAdmin({
            senderId: req.user.id,
            type: 'new_order_request',
            titleKey: 'common.notification.newOrderTitle',
            messageKey: 'common.notification.orderCreatedWhatsApp',
            messageArgs: [order._id.toString().slice(-8), req.user.firstName || req.user.username, order.items.length, order.totalAmount, order.currency],
            relatedEntity: { id: order._id, relatedEntityType: 'Order' },
            sendWhatsapp: true
        });
        await sendNotification({
            recipientId: req.user.id,
            senderId: null, // Système
            type: 'order_status',
            titleKey: 'common.notification.orderCreatedTitle',
            messageKey: 'order.created',
            messageArgs: [order._id.toString().slice(-8)],
            relatedEntity: { id: order._id, relatedEntityType: 'Order' },
            sendWhatsapp: true
        });
        order.notifications.push(...(await Notification.find({ relatedEntity: { id: order._id, relatedEntityType: 'Order' } })).map(n => n._id));
        await order.save({ validateBeforeSave: false });


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
            .populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' }
            });

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
            .populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' }
            });

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

        for (const item of order.items) {
            await ProductVariation.findByIdAndUpdate(item.productVariation, { $inc: { stock: item.quantity } });
            await StockMovement.create({
                variation: item.productVariation,
                product: item.product,
                type: 'in',
                quantity: item.quantity,
                reason: 'annulation_commande',
                reference: order._id.toString(),
                movedBy: req.user.id,
                currentStock: await ProductVariation.findById(item.productVariation).then(v => v.stock)
            });
            await Product.findById(item.product).then(p => p.updateAggregatedData());
        }

        // AJOUTÉ : Notifications
        await sendNotificationToAdmin({
            senderId: req.user.id,
            type: 'order_status',
            titleKey: 'common.notification.orderCancelledTitle',
            messageKey: 'common.notification.orderCancelledWhatsApp',
            messageArgs: [order._id.toString().slice(-8)],
            relatedEntity: { id: order._id, relatedEntityType: 'Order' },
            sendWhatsapp: true
        });
        await sendNotification({
            recipientId: req.user.id,
            senderId: req.user.id,
            type: 'order_status',
            titleKey: 'common.notification.orderCancelledTitle',
            messageKey: 'order.cancelled',
            messageArgs: [order._id.toString().slice(-8)],
            relatedEntity: { id: order._id, relatedEntityType: 'Order' },
            sendWhatsapp: true
        });
        order.notifications.push(...(await Notification.find({ relatedEntity: { id: order._id, relatedEntityType: 'Order' } })).map(n => n._id));
        await order.save({ validateBeforeSave: false });


        res.status(200).json({
            success: true,
            message: req.t('order.cancelled'),
            data: order,
        });
    } catch (error) {
        next(error);
    }
};