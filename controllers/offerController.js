// 5kl-backend/controllers/offerController.js
const Offer = require('../models/Offer');
const Product = require('../models/Product');
const User = require('../models/User'); // Utilisé pour populater les senders de messages
const Cart = require('../models/Cart');
const AppError = require('../utils/appError');
const Joi = require('joi');

// --- Schemas de Validation Joi ---

const createOfferSchema = Joi.object({
    productId: Joi.string().hex().length(24).required(),
    proposedPrice: Joi.number().min(0.01).required(),
    initialMessage: Joi.string().min(1).optional().allow('') // Premier message de l'acheteur
}).options({ stripUnknown: true });

const addMessageToOfferSchema = Joi.object({
    message: Joi.string().min(1).required(),
    price: Joi.number().min(0.01).optional().allow(null) // Pour les contre-offres de l'acheteur si on les permet
}).options({ stripUnknown: true });

// --- Fonctions des Contrôleurs ---

/**
 * @desc    Créer une nouvelle offre de prix pour un produit
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

        const { productId, proposedPrice, initialMessage } = value;

        const product = await Product.findById(productId);
        if (!product || !product.isAvailable) {
            return next(new AppError('offer.productNotFound', 404));
        }
        if (product.stock < 1) { // L'offre est inutile si pas de stock
             return next(new AppError('offer.productOutOfStock', 400));
        }

        // Vérifier si une offre pour ce produit est déjà en cours ou acceptée par cet acheteur
        const existingOffer = await Offer.findOne({
            buyer: req.user.id,
            product: productId,
            status: { $in: ['pending', 'accepted'] }
        });

        if (existingOffer) {
            return next(new AppError('offer.offerAlreadyMade', 400));
        }

        const messages = [{
            sender: req.user.id,
            message: initialMessage || req.t('offer.created'), // Message par défaut si pas d'initialMessage
            timestamp: Date.now(),
            isOffer: true,
            price: proposedPrice
        }];

        const offer = await Offer.create({
            product: productId,
            buyer: req.user.id,
            initialProposedPrice: proposedPrice,
            messages,
            lastActivity: Date.now(),
            status: 'pending'
        });

        // TODO: Notifier l'administrateur de la nouvelle offre (ex: via email ou WebSocket)

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
            .populate('product', 'name price images')
            .sort('-lastActivity'); // Trier par la dernière activité

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
            .populate('product', 'name price images stock shop')
            .populate('messages.sender', 'username email'); // Populer l'expéditeur de chaque message

        if (!offer) {
            return next(new AppError('offer.notFound', 404));
        }

        // Vérifier que l'utilisateur est bien le créateur de l'offre
        if (offer.buyer._id.toString() !== req.user.id) { // Utilisez _id.toString() pour comparer
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

        // Vérifier que l'utilisateur est bien le créateur de l'offre
        if (offer.buyer.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        // L'offre doit être en attente pour ajouter des messages
        if (offer.status !== 'pending') {
            return next(new AppError('offer.notPending', 400));
        }

        const newMessage = {
            sender: req.user.id,
            message: value.message,
            timestamp: Date.now(),
            isOffer: !!value.price, // Si un prix est fourni, c'est une contre-offre de l'acheteur
            price: value.price
        };

        offer.messages.push(newMessage);
        offer.lastActivity = Date.now();
        await offer.save();

        // TODO: Notifier l'administrateur d'un nouveau message de l'acheteur (ex: via email ou WebSocket)

        res.status(200).json({
            success: true,
            message: req.t('offer.messageAdded'),
            data: offer.messages[offer.messages.length - 1] // Retourne le dernier message ajouté
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

        // Vérifier que l'utilisateur est bien le créateur de l'offre
        if (offer.buyer.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        // L'offre ne peut être retirée que si elle est 'pending'
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
 * @desc    Accepter une offre et ajouter le produit au panier avec le prix négocié
 * @route   POST /api/offers/:id/accept-to-cart
 * @access  Private (Buyer owner)
 * Note: Cette route serait typiquement appelée via un lien unique envoyé à l'acheteur après acceptation par l'admin.
 * Pour la sécurité, elle doit aussi vérifier le statut de l'offre.
 */
exports.acceptOfferToCart = async (req, res, next) => {
    try {
        const offer = await Offer.findById(req.params.id).populate('product');

        if (!offer) {
            return next(new AppError('offer.notFound', 404));
        }

        // Vérifier que l'utilisateur est bien le créateur de l'offre
        if (offer.buyer.toString() !== req.user.id) {
            return next(new AppError('offer.buyerNotOwner', 403));
        }

        // L'offre doit avoir été acceptée par l'admin et avoir un prix accepté
        if (offer.status !== 'accepted' || !offer.acceptedPrice) {
            return next(new AppError('offer.acceptLinkExpired', 400));
        }

        // Vérifier le stock du produit au moment de l'ajout au panier
        if (!offer.product || !offer.product.isAvailable || offer.product.stock < 1) {
            return next(new AppError('offer.productOutOfStock', 400));
        }

        let cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            cart = await Cart.create({ user: req.user.id });
        }

        // Vérifier si le produit est déjà dans le panier avec un prix non négocié, et le mettre à jour
        const itemIndex = cart.items.findIndex(item => item.product.toString() === offer.product._id.toString());

        if (itemIndex > -1) {
            // Mettre à jour le prix et la quantité (si l'utilisateur clique plusieurs fois, ajouter un à la quantité)
            // Ou remplacer si l'intention est d'avoir un seul exemplaire de l'offre négociée.
            // Pour l'instant, ajoutons 1 à la quantité existante.
            cart.items[itemIndex].quantity += 1;
            cart.items[itemIndex].priceAtAddToCart = offer.acceptedPrice; // S'assurer que le prix négocié est appliqué
        } else {
            cart.items.push({
                product: offer.product._id,
                quantity: 1,
                priceAtAddToCart: offer.acceptedPrice
            });
        }
        await cart.save(); // Le middleware pre('save') mettra à jour le totalPrice

        // Optionnel: marquer l'offre comme "consumée" ou liée à un panier/commande
        // Si vous voulez lier l'offre à un panier ou une commande future, mettez à jour l'offre ici.
        // offer.order = cart._id; // Ceci est une option, si vous voulez lier l'offre à un panier/commande
        // await offer.save();

        // Après avoir ajouté au panier, l'offre peut être considérée comme "closed" ou "fulfilled"
        // Cela dépend de votre flux métier. Pour l'instant, on la laisse "accepted".

        // Repeupler le panier pour la réponse
        const updatedCart = await Cart.findOne({ user: req.user.id })
                                     .populate('items.product', 'name price images stock shop');

        res.status(200).json({
            success: true,
            message: req.t('offer.addedToCart'),
            data: updatedCart
        });
    } catch (error) {
        next(error);
    }
};