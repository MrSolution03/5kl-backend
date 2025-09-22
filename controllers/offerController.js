// 5kl-backend/controllers/offerController.js
const Offer = require('../models/Offer');
const Product = require('../models/Product');
const ProductVariation = require('../models/ProductVariation');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Notification = require('../models/Notification'); // AJOUTÉ
const { sendNotification, sendNotificationToAdmin } = require('../utils/notificationService'); // AJOUTÉ
const Joi = require('joi');

// --- Schemas de Validation Joi ---
const createOfferSchema = Joi.object({
    productVariationId: Joi.string().hex().length(24).required(),
    proposedPrice: Joi.number().min(0.01).required(),
    initialMessage: Joi.string().min(1).optional().allow('')
}).options({ stripUnknown: true });

const addMessageToOfferSchema = Joi.object({
    message: Joi.string().min(1).required(),
    price: Joi.number().min(0.01).optional().allow(null)
}).options({ stripUnknown: true });


// --- Fonctions des Contrôleurs ---

/**
 * @desc    Créer une nouvelle offre de prix pour une variation de produit
 * @route   POST /api/offers
 * @access  Private (Buyer)
 */
exports.createOffer = async (req, res, next) => {
    try {
        const { error, value } = createOfferSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { productVariationId, proposedPrice, initialMessage } = value;

        const variation = await ProductVariation.findById(productVariationId).populate('product', 'name');
        if (!variation || !variation.isAvailable) {
            return next(new AppError('offer.productVariationNotFound', 404));
        }
        if (variation.stock < 1) {
             return next(new AppError('offer.productOutOfStock', 400));
        }

        // Vérifier si une offre pour cette variation par cet acheteur est déjà "pending"
        // Si oui, nous voulons continuer la conversation existante si c'est la même intention,
        // ou créer une nouvelle si l'ancienne est "close" (accepted/rejected/retracted/expired)
        // La règle est : un client = une offre "active" (pending) par variation de produit.
        const existingActiveOffer = await Offer.findOne({
            buyer: req.user.id,
            productVariation: productVariationId,
            status: 'pending' // Seulement si l'offre est toujours en attente
        });

        if (existingActiveOffer) {
            return next(new AppError('offer.offerAlreadyMade', 400, [variation.product.name + ' (' + variation.attributes.map(a => a.value).join(', ') + ')']));
        }

        const messages = [{
            sender: req.user.id,
            message: initialMessage || req.t('offer.created'),
            timestamp: Date.now(),
            isOffer: true,
            price: proposedPrice
        }];

        const offer = await Offer.create({
            product: variation.product._id,
            productVariation: productVariationId,
            buyer: req.user.id,
            initialProposedPrice: proposedPrice,
            messages,
            lastActivity: Date.now(),
            status: 'pending'
        });

        // AJOUTÉ : Notifications
        await sendNotificationToAdmin({
            senderId: req.user.id,
            type: 'new_offer_request',
            titleKey: 'common.notification.newOfferTitle',
            messageKey: 'common.notification.newOfferWhatsApp',
            messageArgs: [offer._id.toString().slice(-8), variation.product.name + ' (' + variation.attributes.map(a => a.value).join(', ') + ')', req.user.firstName || req.user.username, offer.initialProposedPrice, offer.currency || 'FC'],
            relatedEntity: { id: offer._id, relatedEntityType: 'Offer' },
            sendWhatsapp: true
        });
        await sendNotification({
            recipientId: req.user.id,
            senderId: null, // Système
            type: 'offer_update',
            titleKey: 'common.notification.offerCreatedTitle',
            messageKey: 'offer.created',
            messageArgs: [offer._id.toString().slice(-8), variation.product.name + ' (' + variation.attributes.map(a => a.value).join(', ') + ')'],
            relatedEntity: { id: offer._id, relatedEntityType: 'Offer' },
            sendWhatsapp: false // Pas de WhatsApp par défaut pour l'acheteur sur la création d'offre
        });
        offer.notifications.push(...(await Notification.find({ relatedEntity: { id: offer._id, relatedEntityType: 'Offer' } })).map(n => n._id));
        await offer.save({ validateBeforeSave: false });


        res.status(201).json({
            success: true,
            message: req.t('offer.created'),
            data: offer,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les offres de l'utilisateur connecté
 * @route   GET /api/offers
 * @access  Private (Buyer)
 */
exports.getOffers = async (req, res, next) => {
    try {
        const offers = await Offer.find({ buyer: req.user.id })
            .populate({
                path: 'productVariation',
                populate: { path: 'product', select: 'name images' }
            })
            .sort('-lastActivity');

        res.status(200).json({
            success: true,
            count: offers.length,
            data: offers,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir une offre spécifique par ID (et sa discussion)
 * @route   GET /api/offers/:id
 * @access  Private (Buyer owner)
 */
exports.getOfferById = async (req, res, next) => {
    try {
        const offer = await Offer.findById(req.params.id)
            .populate('buyer', 'username email')
            .populate({
                path: 'productVariation',
                populate: { path: 'product', select: 'name images stock shop' }
            })
            .populate('messages.sender', 'username email');

        if (!offer) {
            return next(new AppError('offer.notFound', 404));
        }

        if (offer.buyer._id.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        res.status(200).json({
            success: true,
            data: offer,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    L'acheteur ajoute un message ou une contre-offre à une discussion d'offre
 * @route   POST /api/offers/:id/message
 * @access  Private (Buyer owner)
 */
exports.addMessageToOffer = async (req, res, next) => {
    try {
        const { error, value } = addMessageToOfferSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const offer = await Offer.findById(req.params.id).populate('productVariation', 'product');
        if (!offer) {
            return next(new AppError('offer.notFound', 404));
        }

        if (offer.buyer.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        if (offer.status !== 'pending') {
            return next(new AppError('offer.notPending', 400));
        }

        const newMessage = {
            sender: req.user.id,
            message: value.message,
            timestamp: Date.now(),
            isOffer: !!value.price,
            price: value.price
        };

        offer.messages.push(newMessage);
        offer.lastActivity = Date.now();
        await offer.save();

        // AJOUTÉ : Notifications
        await sendNotificationToAdmin({
            senderId: req.user.id,
            type: 'offer_update',
            titleKey: 'common.notification.offerMessageTitle',
            messageKey: 'common.notification.offerMessageTitle',
            messageArgs: [offer._id.toString().slice(-8), offer.productVariation.product.name + ' (' + offer.productVariation.attributes.map(a => a.value).join(', ') + ')'],
            relatedEntity: { id: offer._id, relatedEntityType: 'Offer' },
            sendWhatsapp: false // L'admin peut choisir de ne pas recevoir tous les messages de discussion par WhatsApp
        });
        // Pas de notification WhatsApp à l'acheteur pour chaque message de discussion

        offer.notifications.push(...(await Notification.find({ relatedEntity: { id: offer._id, relatedEntityType: 'Offer' } })).map(n => n._id));
        await offer.save({ validateBeforeSave: false });


        res.status(200).json({
            success: true,
            message: req.t('offer.messageAdded'),
            data: offer.messages[offer.messages.length - 1]
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    L'acheteur retire son offre
 * @route   PUT /api/offers/:id/retract
 * @access  Private (Buyer owner)
 */
exports.retractOffer = async (req, res, next) => {
    try {
        const offer = await Offer.findById(req.params.id).populate('productVariation', 'product');
        if (!offer) {
            return next(new AppError('offer.notFound', 404));
        }

        if (offer.buyer.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        if (offer.status !== 'pending') {
            return next(new AppError('offer.alreadyAcceptedOrRejected', 400));
        }

        offer.status = 'retracted';
        offer.messages.push({
            sender: req.user.id,
            message: req.t('offer.retracted'),
            timestamp: Date.now()
        });
        offer.lastActivity = Date.now();
        await offer.save();

        // AJOUTÉ : Notifications
        await sendNotificationToAdmin({
            senderId: req.user.id,
            type: 'offer_update',
            titleKey: 'common.notification.offerRejectedTitle', // Ou une clé "Offer Retracted"
            messageKey: 'offer.retracted',
            messageArgs: [offer._id.toString().slice(-8), offer.productVariation.product.name + ' (' + offer.productVariation.attributes.map(a => a.value).join(', ') + ')'],
            relatedEntity: { id: offer._id, relatedEntityType: 'Offer' },
            sendWhatsapp: true
        });
        offer.notifications.push(...(await Notification.find({ relatedEntity: { id: offer._id, relatedEntityType: 'Offer' } })).map(n => n._id));
        await offer.save({ validateBeforeSave: false });


        res.status(200).json({
            success: true,
            message: req.t('offer.retracted'),
            data: offer,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Accepter une offre et ajouter le produit (variation) au panier avec le prix négocié
 * @route   POST /api/offers/:id/accept-to-cart
 * @access  Private (Buyer owner)
 */
exports.acceptOfferToCart = async (req, res, next) => {
    try {
        const offer = await Offer.findById(req.params.id).populate('productVariation');

        if (!offer) {
            return next(new AppError('offer.notFound', 404));
        }

        if (offer.buyer.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        if (offer.status !== 'accepted' || !offer.acceptedPrice) {
            return next(new AppError('offer.acceptLinkExpired', 400));
        }

        const variation = offer.productVariation;
        if (!variation || !variation.isAvailable || variation.stock < 1) {
            return next(new AppError('offer.productOutOfStock', 400));
        }

        let cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            cart = await Cart.create({ user: req.user.id });
        }

        const itemIndex = cart.items.findIndex(item => item.productVariation.toString() === variation._id.toString());

        if (itemIndex > -1) {
            cart.items[itemIndex].quantity += 1;
            cart.items[itemIndex].priceAtAddToCart = offer.acceptedPrice;
        } else {
            cart.items.push({
                productVariation: variation._id,
                quantity: 1,
                priceAtAddToCart: offer.acceptedPrice
            });
        }
        await cart.save();

        const updatedCart = await Cart.findOne({ user: req.user.id })
                                     .populate({
                                        path: 'items.productVariation',
                                        populate: { path: 'product', select: 'name images' }
                                     });

        res.status(200).json({
            success: true,
            message: req.t('offer.addedToCart'),
            data: updatedCart
        });
    } catch (error) {
        next(error);
    }
};