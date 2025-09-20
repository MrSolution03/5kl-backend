// 5kl-backend/controllers/adminController.js
const User = require('../models/User');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const CurrencyRate = require('../models/CurrencyRate'); // AJOUTÉ : Modèle pour les taux de change
const AppError = require('../utils/appError');
const Joi = require('joi');
const { cloudinary } = require('../utils/cloudinary');
const { SUPPORTED_CURRENCIES } = require('../utils/i18n'); // AJOUTÉ pour validation des devises

// --- Schemas de Validation Joi ---

const updateUserRoleSchema = Joi.object({
    roles: Joi.array().items(Joi.string().valid('buyer', 'seller', 'admin')).min(1).required()
});

const updateShopStatusSchema = Joi.object({
    isActive: Joi.boolean().required()
});

const updateOrderStatusSchema = Joi.object({
    status: Joi.string().valid('pending_admin_approval', 'accepted', 'rejected', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned').required(),
    adminNotes: Joi.string().optional().allow(null, '')
});

const acceptOfferSchema = Joi.object({
    acceptedPrice: Joi.number().min(0.01).required()
});

const rejectReasonSchema = Joi.object({
    adminNotes: Joi.string().min(10).required()
});

const offerMessageSchema = Joi.object({
    message: Joi.string().min(1).required(),
    price: Joi.number().min(0.01).optional()
});

const categoryUpdateSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    parentCategory: Joi.string().hex().length(24).optional().allow(null),
    description: Joi.string().trim().max(500).optional().allow(null, ''),
    image: Joi.string().uri().optional().allow(null, '')
});

const brandUpdateSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    description: Joi.string().trim().max(500).optional().allow(null, ''),
    logo: Joi.string().uri().optional().allow(null, '')
});

// AJOUTÉ : Schéma pour la mise à jour du taux de change
const updateCurrencyRateSchema = Joi.object({
    USD_TO_FC_RATE: Joi.number().min(1).required()
});

// AJOUTÉ : Schéma pour marquer une commande comme payée
const markOrderAsPaidSchema = Joi.object({
    isPaid: Joi.boolean().required()
});


// --- Fonctions des Contrôleurs ---

// --- Gestion des utilisateurs (inchangé) ---

/**
 * @desc    Obtenir tous les utilisateurs
 * @route   GET /api/admin/users?page=1&limit=10
 * @access  Private (Admin)
 */
exports.getAllUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const users = await User.find().select('-password')
                                .skip(skip)
                                .limit(limit);

        const totalUsers = await User.countDocuments();

        res.status(200).json({
            success: true,
            count: users.length,
            total: totalUsers,
            page,
            pages: Math.ceil(totalUsers / limit),
            data: users
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir les détails d'un utilisateur par ID
 * @route   GET /api/admin/users/:id
 * @access  Private (Admin)
 */
exports.getUserDetails = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password').populate('shop', 'name');
        if (!user) {
            return next(new AppError('admin.userNotFound', 404));
        }
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour les rôles d'un utilisateur
 * @route   PUT /api/admin/users/:id/role
 * @access  Private (Admin)
 */
exports.updateUserRole = async (req, res, next) => {
    try {
        const { error, value } = updateUserRoleSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return next(new AppError('admin.userNotFound', 404));
        }

        user.roles = value.roles;
        await user.save({ validateBeforeSave: true });

        res.status(200).json({
            success: true,
            message: req.t('admin.userRolesUpdated'),
            data: user
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Supprimer un utilisateur par ID
 * @route   DELETE /api/admin/users/:id
 * @access  Private (Admin)
 */
exports.deleteUser = async (req, res, next) => {
    try {
        if (req.user.id === req.params.id) {
            return next(new AppError('admin.cannotDeleteAdmin', 403));
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return next(new AppError('admin.userNotFound', 404));
        }

        // TODO: Implémenter la logique de suppression en cascade pour les données liées
        await user.deleteOne();

        res.status(200).json({
            success: true,
            message: req.t('admin.userDeleted')
        });
    } catch (error) {
        next(error);
    }
};


// --- Gestion des boutiques (inchangé) ---

/**
 * @desc    Obtenir toutes les boutiques (y compris celles non approuvées)
 * @route   GET /api/admin/shops?page=1&limit=10
 * @access  Private (Admin)
 */
exports.getAllShops = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const shops = await Shop.find()
                                .populate('owner', 'username email')
                                .skip(skip)
                                .limit(limit);

        const totalShops = await Shop.countDocuments();

        res.status(200).json({
            success: true,
            count: shops.length,
            total: totalShops,
            page,
            pages: Math.ceil(totalShops / limit),
            data: shops
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Approuver une boutique
 * @route   PUT /api/admin/shops/:id/approve
 * @access  Private (Admin)
 */
exports.approveShop = async (req, res, next) => {
    try {
        const shop = await Shop.findById(req.params.id);
        if (!shop) {
            return next(new AppError('admin.shopNotFound', 404));
        }
        if (shop.isApproved) {
            return next(new AppError('admin.shopAlreadyApproved', 400));
        }

        shop.isApproved = true;
        await shop.save();

        res.status(200).json({
            success: true,
            message: req.t('admin.shopApproved'),
            data: shop
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Désactiver ou réactiver une boutique
 * @route   PUT /api/admin/shops/:id/status
 * @access  Private (Admin)
 */
exports.updateShopStatus = async (req, res, next) => {
    try {
        const { error, value } = updateShopStatusSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const shop = await Shop.findById(req.params.id);
        if (!shop) {
            return next(new AppError('admin.shopNotFound', 404));
        }

        shop.isActive = value.isActive;
        await shop.save();

        res.status(200).json({
            success: true,
            message: value.isActive ? req.t('admin.shopActivated') : req.t('admin.shopDeactivated'),
            data: shop
        });
    } catch (error) {
        next(error);
    }
};


// --- Gestion des commandes ---

/**
 * @desc    Obtenir toutes les commandes
 * @route   GET /api/admin/orders?page=1&limit=10
 * @access  Private (Admin)
 */
exports.getAllOrders = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find()
            .populate('user', 'username email')
            .populate('items.product', 'name price shop')
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments();

        res.status(200).json({
            success: true,
            count: orders.length,
            total: totalOrders,
            page,
            pages: Math.ceil(totalOrders / limit),
            data: orders
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les commandes en attente d'approbation
 * @route   GET /api/admin/orders/pending?page=1&limit=10
 * @access  Private (Admin)
 */
exports.getPendingOrders = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find({ status: 'pending_admin_approval' })
            .populate('user', 'username email')
            .populate('items.product', 'name price shop')
            .skip(skip)
            .limit(limit);

        const totalPendingOrders = await Order.countDocuments({ status: 'pending_admin_approval' });

        res.status(200).json({
            success: true,
            count: orders.length,
            total: totalPendingOrders,
            page,
            pages: Math.ceil(totalPendingOrders / limit),
            data: orders
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Accepter une commande
 * @route   PUT /api/admin/orders/:id/accept
 * @access  Private (Admin)
 */
exports.acceptOrder = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return next(new AppError('admin.orderNotFound', 404));
        }

        if (order.status !== 'pending_admin_approval') {
            return next(new AppError('admin.invalidOrderStatus', 400, [req.t('admin.invalidOrderStatusMessage', order.status)]));
        }

        order.status = 'accepted';
        order.deliveryTracking.push({ status: 'accepted' });
        await order.save();

        // TODO: Notifier l'utilisateur et le(s) vendeur(s)
        // TODO: Décrémenter les stocks des produits (si non fait au checkout)

        res.status(200).json({
            success: true,
            message: req.t('admin.orderAccepted'),
            data: order
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Rejeter une commande
 * @route   PUT /api/admin/orders/:id/reject
 * @access  Private (Admin)
 */
exports.rejectOrder = async (req, res, next) => {
    try {
        const { error, value } = rejectReasonSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return next(new AppError('admin.orderNotFound', 404));
        }

        if (order.status !== 'pending_admin_approval') {
            return next(new AppError('admin.invalidOrderStatus', 400, [req.t('admin.invalidOrderStatusMessage', order.status)]));
        }

        order.status = 'rejected';
        order.adminNotes = value.adminNotes;
        order.deliveryTracking.push({ status: 'rejected' });
        await order.save();

        // TODO: Notifier l'utilisateur avec la raison du rejet
        // TODO: Restaurer les stocks des produits (si décrémentés au checkout)

        res.status(200).json({
            success: true,
            message: req.t('admin.orderRejected'),
            data: order
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour le statut de livraison d'une commande
 * @route   PUT /api/admin/orders/:id/status
 * @access  Private (Admin)
 */
exports.updateOrderStatus = async (req, res, next) => {
    try {
        const { error, value } = updateOrderStatusSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return next(new AppError('admin.orderNotFound', 404));
        }

        const validTransitions = {
            'pending_admin_approval': ['accepted', 'rejected'],
            'accepted': ['processing', 'cancelled'],
            'processing': ['shipped', 'cancelled'],
            'shipped': ['out_for_delivery', 'returned'],
            'out_for_delivery': ['delivered', 'returned'],
            'delivered': ['returned'],
            'rejected': [],
            'cancelled': [],
            'returned': []
        };

        if (!validTransitions[order.status] || !validTransitions[order.status].includes(value.status)) {
             return next(new AppError('admin.invalidOrderStatus', 400, [req.t('admin.unauthorizedStatusTransition', order.status, value.status)]));
        }

        order.status = value.status;
        if (value.adminNotes) {
            order.adminNotes = value.adminNotes;
        }
        order.deliveryTracking.push({ status: value.status, location: value.adminNotes });
        await order.save();

        // TODO: Notifier l'utilisateur des changements de statut

        res.status(200).json({
            success: true,
            message: req.t('admin.orderStatusUpdated'),
            data: order
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Marquer une commande comme payée
 * @route   PUT /api/admin/orders/:id/mark-as-paid
 * @access  Private (Admin)
 */
exports.markOrderAsPaid = async (req, res, next) => {
    try {
        const { error, value } = markOrderAsPaidSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return next(new AppError('admin.orderNotFound', 404));
        }

        // Seules les commandes livrées peuvent être marquées comme payées dans un système P.O.D.
        if (order.status !== 'delivered') {
            return next(new AppError('admin.cannotMarkAsPaidNotDelivered', 400, [order.status])); // Nouvelle clé
        }
        if (order.isPaid && value.isPaid) {
            return next(new AppError('admin.orderAlreadyPaid', 400)); // Nouvelle clé
        }

        order.isPaid = value.isPaid; // True or false
        await order.save();

        res.status(200).json({
            success: true,
            message: value.isPaid ? req.t('admin.orderMarkedAsPaid') : req.t('admin.orderMarkedAsUnpaid'), // Nouvelles clés
            data: order
        });
    } catch (error) {
        next(error);
    }
};


// --- Gestion des offres de prix (inchangé) ---

/**
 * @desc    Obtenir toutes les offres (y compris celles en attente)
 * @route   GET /api/admin/offers?page=1&limit=10
 * @access  Private (Admin)
 */
exports.getAllOffers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const offers = await Offer.find()
            .populate('buyer', 'username email')
            .populate('product', 'name price shop')
            .skip(skip)
            .limit(limit);

        const totalOffers = await Offer.countDocuments();

        res.status(200).json({
            success: true,
            count: offers.length,
            total: totalOffers,
            page,
            pages: Math.ceil(totalOffers / limit),
            data: offers
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les offres en attente d'approbation
 * @route   GET /api/admin/offers/pending?page=1&limit=10
 * @access  Private (Admin)
 */
exports.getPendingOffers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const offers = await Offer.find({ status: 'pending' })
            .populate('buyer', 'username email')
            .populate('product', 'name price shop')
            .skip(skip)
            .limit(limit);

        const totalPendingOffers = await Offer.countDocuments({ status: 'pending' });

        res.status(200).json({
            success: true,
            count: offers.length,
            total: totalPendingOffers,
            page,
            pages: Math.ceil(totalPendingOffers / limit),
            data: offers
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Accepter une offre de prix
 * @route   PUT /api/admin/offers/:id/accept
 * @access  Private (Admin)
 */
exports.acceptOffer = async (req, res, next) => {
    try {
        const { error, value } = acceptOfferSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const offer = await Offer.findById(req.params.id).populate('product', 'name price');
        if (!offer) {
            return next(new AppError('admin.offerNotFound', 404));
        }

        if (offer.status !== 'pending') {
            return next(new AppError('admin.offerAlreadyAcceptedOrRejected', 400));
        }

        if (value.acceptedPrice < offer.product.price) { // Exemple de règle métier
            return next(new AppError('admin.invalidOfferPrice', 400));
        }

        offer.status = 'accepted';
        offer.acceptedPrice = value.acceptedPrice;
        offer.messages.push({
            sender: req.user.id,
            message: req.t('admin.offerAccepted'),
            timestamp: Date.now(),
            isOffer: true,
            price: value.acceptedPrice
        });
        await offer.save();

        // TODO: Notifier l'acheteur que son offre a été acceptée avec le prix final

        res.status(200).json({
            success: true,
            message: req.t('admin.offerAccepted'),
            data: offer
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Rejeter une offre de prix
 * @route   PUT /api/admin/offers/:id/reject
 * @access  Private (Admin)
 */
exports.rejectOffer = async (req, res, next) => {
    try {
        const { error, value } = rejectReasonSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return next(new AppError('admin.offerNotFound', 404));
        }

        if (offer.status !== 'pending') {
            return next(new AppError('admin.offerAlreadyAcceptedOrRejected', 400));
        }

        offer.status = 'rejected';
        offer.adminNotes = value.adminNotes;
        offer.messages.push({
            sender: req.user.id,
            message: req.t('admin.offerRejected') + `: ${value.adminNotes}`,
            timestamp: Date.now()
        });
        await offer.save();

        // TODO: Notifier l'acheteur que son offre a été rejetée avec la raison.

        res.status(200).json({
            success: true,
            message: req.t('admin.offerRejected'),
            data: offer
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    L'admin ajoute un message ou une contre-offre à une discussion d'offre
 * @route   POST /api/admin/offers/:id/message
 * @access  Private (Admin)
 */
exports.addAdminMessageToOffer = async (req, res, next) => {
    try {
        const { error, value } = offerMessageSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return next(new AppError('admin.offerNotFound', 404));
        }

        if (offer.status !== 'pending') {
            return next(new AppError('admin.offerAlreadyAcceptedOrRejected', 400, [req.t('admin.cannotMessageNonPendingOffer')]));
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

        // TODO: Notifier l'acheteur du nouveau message/contre-offre

        res.status(200).json({
            success: true,
            message: req.t('admin.offerMessageAdded'),
            data: offer.messages[offer.messages.length - 1]
        });

    } catch (error) {
        next(error);
    }
};


// --- Gestion des catégories (update/delete - create est dans productController) (inchangé) ---

/**
 * @desc    Mettre à jour une catégorie
 * @route   PUT /api/admin/categories/:id
 * @access  Private (Admin)
 */
exports.updateCategory = async (req, res, next) => {
    try {
        const { error, value } = categoryUpdateSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const category = await Category.findById(req.params.id);
        if (!category) {
            return next(new AppError('admin.categoryNotFound', 404));
        }

        if (value.name && value.name !== category.name) {
            const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${value.name}$`, 'i') } });
            if (existingCategory && existingCategory._id.toString() !== category._id.toString()) {
                return next(new AppError('category.alreadyExists', 400));
            }
        }

        if (value.parentCategory && value.parentCategory !== category.parentCategory?.toString()) {
            const parent = await Category.findById(value.parentCategory);
            if (!parent) {
                return next(new AppError('admin.categoryNotFound', 400));
            }
        }

        Object.assign(category, value);
        await category.save({ runValidators: true });

        res.status(200).json({
            success: true,
            message: req.t('admin.categoryUpdated'),
            data: category
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Supprimer une catégorie
 * @route   DELETE /api/admin/categories/:id
 * @access  Private (Admin)
 */
exports.deleteCategory = async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return next(new AppError('admin.categoryNotFound', 404));
        }

        const productsCount = await Product.countDocuments({ category: category._id });
        const subCategoriesCount = await Category.countDocuments({ parentCategory: category._id });

        if (productsCount > 0 || subCategoriesCount > 0) {
            return next(new AppError('admin.categoryDeleteForbidden', 400));
        }

        await category.deleteOne();

        res.status(200).json({
            success: true,
            message: req.t('admin.categoryDeleted')
        });
    } catch (error) {
        next(error);
    }
};


// --- Gestion des marques (update/delete - create est dans productController) (inchangé) ---

/**
 * @desc    Mettre à jour une marque
 * @route   PUT /api/admin/brands/:id
 * @access  Private (Admin)
 */
exports.updateBrand = async (req, res, next) => {
    try {
        const { error, value } = brandUpdateSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            return next(new AppError('admin.brandNotFound', 404));
        }

        if (value.name && value.name !== brand.name) {
            const existingBrand = await Brand.findOne({ name: { $regex: new RegExp(`^${value.name}$`, 'i') } });
            if (existingBrand && existingBrand._id.toString() !== brand._id.toString()) {
                return next(new AppError('brand.alreadyExists', 400));
            }
        }

        Object.assign(brand, value);
        await brand.save({ runValidators: true });

        res.status(200).json({
            success: true,
            message: req.t('admin.brandUpdated'),
            data: brand
        });
    } catch (error) {
        next(error);
    }
    };

/**
 * @desc    Supprimer une marque
 * @route   DELETE /api/admin/brands/:id
 * @access  Private (Admin)
 */
exports.deleteBrand = async (req, res, next) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            return next(new AppError('admin.brandNotFound', 404));
        }

        const productsCount = await Product.countDocuments({ brand: brand._id });
        if (productsCount > 0) {
            return next(new AppError('admin.brandDeleteForbidden', 400));
        }

        await brand.deleteOne();

        res.status(200).json({
            success: true,
            message: req.t('admin.brandDeleted')
        });
    } catch (error) {
        next(error);
    }
};

// --- AJOUTÉ : Gestion des Taux de Change ---

/**
 * @desc    Obtenir le taux de conversion USD_TO_FC_RATE
 * @route   GET /api/admin/currency-rate
 * @access  Private (Admin)
 */
exports.getCurrencyRate = async (req, res, next) => {
    try {
        // Crée le document si inexistant, sinon le récupère
        let currencyRate = await CurrencyRate.findOne();
        if (!currencyRate) {
            currencyRate = await CurrencyRate.create({ USD_TO_FC_RATE: 2700, lastUpdatedBy: req.user.id }); // Taux par défaut
        }

        res.status(200).json({
            success: true,
            data: currencyRate
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour le taux de conversion USD_TO_FC_RATE
 * @route   PUT /api/admin/currency-rate
 * @access  Private (Admin)
 */
exports.updateCurrencyRate = async (req, res, next) => {
    try {
        const { error, value } = updateCurrencyRateSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        let currencyRate = await CurrencyRate.findOne();
        if (!currencyRate) {
            // Si le document n'existe pas, le créer et y appliquer la mise à jour
            currencyRate = await CurrencyRate.create({
                USD_TO_FC_RATE: value.USD_TO_FC_RATE,
                lastUpdatedBy: req.user.id
            });
        } else {
            currencyRate.USD_TO_FC_RATE = value.USD_TO_FC_RATE;
            currencyRate.lastUpdatedBy = req.user.id;
            await currencyRate.save();
        }

        res.status(200).json({
            success: true,
            message: req.t('admin.currencyRateUpdated'),
            data: currencyRate
        });
    } catch (error) {
        next(error);
    }
};