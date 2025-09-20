// 5kl-backend/controllers/offerController.js
const Offer = require('../models/Offer');
const Product = require('../models/Product'); // Pour le produit parent
const ProductVariation = require('../models/ProductVariation'); // AJOUTÉ
const User = require('../models/User');
const Cart = require('../models/Cart');
const AppError = require('../utils/appError');
const Joi = require('joi');

// --- Schemas de Validation Joi ---

const createOfferSchema = Joi.object({
    productVariationId: Joi.string().hex().length(24).required(), // MODIFIÉ
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

        // Vérifier si une offre pour cette variation est déjà en cours ou acceptée par cet acheteur
        const existingOffer = await Offer.findOne({
            buyer: req.user.id,
            productVariation: productVariationId, // MODIFIÉ
            status: { $in: ['pending', 'accepted'] }
        });

        if (existingOffer) {
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
            product: variation.product._id, // Référence au produit parent
            productVariation: productVariationId, // MODIFIÉ
            buyer: req.user.id,
            initialProposedPrice: proposedPrice,
            messages,
            lastActivity: Date.now(),
            status: 'pending'
        });

        // TODO: Notifier l'administrateur de la nouvelle offre

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

        const offer = await Offer.findById(req.params.id);
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

        // TODO: Notifier l'administrateur d'un nouveau message de l'acheteur

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
        const offer = await Offer.findById(req.params.id);
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

        // TODO: Notifier l'administrateur que l'offre a été retirée

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
        const offer = await Offer.findById(req.params.id).populate('productVariation'); // MODIFIÉ

        if (!offer) {
            return next(new AppError('offer.notFound', 404));
        }

        if (offer.buyer.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        if (offer.status !== 'accepted' || !offer.acceptedPrice) {
            return next(new AppError('offer.acceptLinkExpired', 400));
        }

        const variation = offer.productVariation; // La variation
        if (!variation || !variation.isAvailable || variation.stock < 1) { // Vérifier le stock de la variation
            return next(new AppError('offer.productOutOfStock', 400));
        }

        let cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            cart = await Cart.create({ user: req.user.id });
        }

        const itemIndex = cart.items.findIndex(item => item.productVariation.toString() === variation._id.toString()); // MODIFIÉ

        if (itemIndex > -1) {
            cart.items[itemIndex].quantity += 1;
            cart.items[itemIndex].priceAtAddToCart = offer.acceptedPrice;
        } else {
            cart.items.push({
                productVariation: variation._id, // MODIFIÉ
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