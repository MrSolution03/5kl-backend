// 5kl-backend/controllers/userController.js
const User = require('../models/User');
const Order = require('../models/Order'); // Pour le tableau de bord
const Offer = require('../models/Offer'); // Pour le tableau de bord
const Product = require('../models/Product'); // Pour les recommandations
const Joi = require('joi');
const AppError = require('../utils/appError');
const bcrypt = require('bcryptjs');

// Validation schema for updating user profile (unchanged)
const updateUserSchema = Joi.object({
    username: Joi.string().min(3).max(30).optional(),
    firstName: Joi.string().optional(),
    lastName: Joi.string().optional(),
    phone: Joi.string().optional(),
});

// Validation schema for adding/updating addresses (unchanged)
const addressSchema = Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zipCode: Joi.string().required(),
    country: Joi.string().required(),
    isDefault: Joi.boolean().optional().default(false)
});

// Validation schema for changing password (NEW)
const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    newPasswordConfirm: Joi.string().valid(Joi.ref('newPassword')).required()
}).options({ stripUnknown: true });


// --- Fonctions des Contrôleurs ---

/**
 * @desc    Obtenir le profil de l'utilisateur connecté
 * @route   GET /api/users/me
 * @access  Private (User)
 */
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return next(new AppError('user.notFound', 404));
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
 * @desc    Mettre à jour le profil de l'utilisateur connecté
 * @route   PUT /api/users/me
 * @access  Private (User)
 */
exports.updateUser = async (req, res, next) => {
    try {
        const { error, value } = updateUserSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        if (value.username && value.username !== user.username) {
            const existingUserWithUsername = await User.findOne({ username: value.username });
            if (existingUserWithUsername && existingUserWithUsername._id.toString() !== user._id.toString()) {
                return next(new AppError('user.usernameTaken', 400));
            }
            user.username = value.username;
        }
        if (value.firstName) user.firstName = value.firstName;
        if (value.lastName) user.lastName = value.lastName;
        if (value.phone) user.phone = value.phone;

        await user.save({ validateBeforeSave: true });

        res.status(200).json({
            success: true,
            message: req.t('user.profileUpdated'),
            data: user
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Changer le mot de passe de l'utilisateur connecté
 * @route   PUT /api/users/me/changepassword
 * @access  Private (User with local password)
 */
exports.changePassword = async (req, res, next) => {
    try {
        const { error, value } = changePasswordSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { currentPassword, newPassword } = value;

        // Récupérer l'utilisateur avec le mot de passe (select: false)
        const user = await User.findById(req.user.id).select('+password');

        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        // Si l'utilisateur s'est connecté via OAuth et n'a pas de mot de passe local
        if (!user.password) {
            return next(new AppError('user.passwordUpdateForbidden', 403));
        }

        // Vérifier si le mot de passe actuel est correct
        if (!(await user.matchPassword(currentPassword))) {
            return next(new AppError('auth.currentPasswordInvalid', 401));
        }

        // Mettre à jour le mot de passe
        user.password = newPassword;
        await user.save(); // Le middleware pre('save') hachera le nouveau mot de passe

        // TODO: Invalider tous les tokens JWT précédents pour cet utilisateur (complex, requires token blacklist or refresh tokens)
        // Pour l'instant, l'utilisateur devra se reconnecter avec le nouveau mot de passe.

        res.status(200).json({
            success: true,
            message: req.t('auth.passwordChanged')
        });
    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Supprimer le profil de l'utilisateur connecté
 * @route   DELETE /api/users/me
 * @access  Private (User)
 */
exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        // TODO: Implémenter la logique de suppression en cascade pour les données liées
        await user.deleteOne();

        res.status(200).json({
            success: true,
            message: req.t('user.accountDeleted')
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Ajouter une nouvelle adresse à l'utilisateur connecté
 * @route   POST /api/users/me/addresses
 * @access  Private (User)
 */
exports.addAddress = async (req, res, next) => {
    try {
        const { error, value } = addressSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        if (value.isDefault) {
            user.addresses.forEach(addr => addr.isDefault = false);
        } else if (user.addresses.length === 0) {
            value.isDefault = true;
        }

        user.addresses.push(value);
        await user.save();

        res.status(201).json({
            success: true,
            message: req.t('user.addressAdded'),
            data: user.addresses
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour une adresse spécifique de l'utilisateur connecté
 * @route   PUT /api/users/me/addresses/:addressId
 * @access  Private (User)
 */
exports.updateUserAddress = async (req, res, next) => {
    try {
        const { addressId } = req.params;
        const { error, value } = addressSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return next(new AppError('user.addressNotFound', 404));
        }

        if (value.isDefault) {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        Object.assign(user.addresses[addressIndex], value);

        await user.save();

        res.status(200).json({
            success: true,
            message: req.t('user.addressUpdated'),
            data: user.addresses[addressIndex]
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Supprimer une adresse spécifique de l'utilisateur connecté
 * @route   DELETE /api/users/me/addresses/:addressId
 * @access  Private (User)
 */
exports.removeAddress = async (req, res, next) => {
    try {
        const { addressId } = req.params;

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        const originalLength = user.addresses.length;
        user.addresses = user.addresses.filter(addr => addr._id.toString() !== addressId);

        if (user.addresses.length === originalLength) {
            return next(new AppError('user.addressNotFound', 404));
        }

        if (user.addresses.length === 1 && !user.addresses[0].isDefault) {
            user.addresses[0].isDefault = true;
        } else if (user.addresses.length > 0 && !user.addresses.some(addr => addr.isDefault)) {
            user.addresses[0].isDefault = true;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: req.t('user.addressRemoved'),
            data: user.addresses
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir le tableau de bord de l'acheteur (commandes, offres)
 * @route   GET /api/users/me/dashboard
 * @access  Private (Buyer)
 */
exports.getBuyerDashboard = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        // Récupérer les 5 dernières commandes (ou paginées)
        const orders = await Order.find({
            user: userId,
            // Filtrer les commandes archivées si la date d'archivage est définie
            ...(req.user.orderHistoryArchivedAt && { createdAt: { $gt: req.user.orderHistoryArchivedAt } })
        })
        .sort('-createdAt')
        .limit(limit)
        .skip(skip)
        .populate('items.product', 'name price images');

        const totalOrders = await Order.countDocuments({
            user: userId,
            ...(req.user.orderHistoryArchivedAt && { createdAt: { $gt: req.user.orderHistoryArchivedAt } })
        });


        // Récupérer les 5 dernières offres (ou paginées)
        const offers = await Offer.find({
            buyer: userId,
            // Filtrer les offres archivées
            ...(req.user.offerHistoryArchivedAt && { createdAt: { $gt: req.user.offerHistoryArchivedAt } })
        })
        .sort('-lastActivity')
        .limit(limit)
        .skip(skip)
        .populate('product', 'name price images');

        const totalOffers = await Offer.countDocuments({
            buyer: userId,
            ...(req.user.offerHistoryArchivedAt && { createdAt: { $gt: req.user.offerHistoryArchivedAt } })
        });


        res.status(200).json({
            success: true,
            message: req.t('user.dashboardRetrieved'),
            data: {
                profile: req.user, // Le profil de l'utilisateur est déjà dans req.user (sans mdp)
                orders: {
                    data: orders,
                    total: totalOrders,
                    page,
                    pages: Math.ceil(totalOrders / limit)
                },
                offers: {
                    data: offers,
                    total: totalOffers,
                    page,
                    pages: Math.ceil(totalOffers / limit)
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Archiver l'historique des commandes de l'utilisateur
 * @route   DELETE /api/users/me/history/orders
 * @access  Private (Buyer)
 */
exports.archiveOrderHistory = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // On n'archive pas les commandes en cours ou en attente, seulement celles terminées ou annulées
        const ordersToArchive = await Order.countDocuments({
            user: userId,
            status: { $in: ['delivered', 'cancelled', 'returned', 'rejected'] },
            ...(req.user.orderHistoryArchivedAt && { createdAt: { $gt: req.user.orderHistoryArchivedAt } })
        });

        if (ordersToArchive === 0) {
            return next(new AppError('user.noHistoryToDelete', 404));
        }

        // Mettre à jour la date d'archivage dans le profil de l'utilisateur
        await User.findByIdAndUpdate(userId, { orderHistoryArchivedAt: Date.now() });

        res.status(200).json({
            success: true,
            message: req.t('user.orderHistoryCleared'),
            archivedUntil: Date.now()
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Archiver l'historique des offres de l'utilisateur
 * @route   DELETE /api/users/me/history/offers
 * @access  Private (Buyer)
 */
exports.archiveOfferHistory = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // On n'archive pas les offres en attente
        const offersToArchive = await Offer.countDocuments({
            buyer: userId,
            status: { $in: ['accepted', 'rejected', 'retracted', 'expired'] },
            ...(req.user.offerHistoryArchivedAt && { createdAt: { $gt: req.user.offerHistoryArchivedAt } })
        });

        if (offersToArchive === 0) {
            return next(new AppError('user.noHistoryToDelete', 404));
        }

        await User.findByIdAndUpdate(userId, { offerHistoryArchivedAt: Date.now() });

        res.status(200).json({
            success: true,
            message: req.t('user.offerHistoryCleared'),
            archivedUntil: Date.now()
        });
    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Obtenir des recommandations de produits pour l'utilisateur
 * @route   GET /api/users/me/recommendations
 * @access  Private (Buyer)
 */
exports.getRecommendedProducts = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId); // Récupérer l'utilisateur pour les produits récemment consultés

        let recommendations = [];

        // Logique de recommandation basique
        // 1. Basé sur les 3 derniers produits consultés (si disponibles)
        const lastViewedProductIds = user.lastViewedProducts
            .sort((a, b) => b.timestamp - a.timestamp) // Plus récent en premier
            .slice(0, 3) // Les 3 derniers
            .map(item => item.product);

        let productsFromSimilarCategories = [];
        if (lastViewedProductIds.length > 0) {
            const viewedProducts = await Product.find({ _id: { $in: lastViewedProductIds } });
            const categories = [...new Set(viewedProducts.map(p => p.category.toString()))];

            productsFromSimilarCategories = await Product.find({
                category: { $in: categories },
                _id: { $nin: lastViewedProductIds }, // Exclure les produits déjà consultés
                isAvailable: true
            })
            .limit(5)
            .populate('shop', 'name')
            .populate('category', 'name')
            .populate('brand', 'name');
        }

        // 2. Si pas assez de recommandations, ajouter des produits populaires/récents
        if (productsFromSimilarCategories.length < 5) {
            const popularProducts = await Product.find({ isAvailable: true, _id: { $nin: lastViewedProductIds } })
                .sort('-createdAt') // Ou par un champ de "popularité" si vous en avez un
                .limit(10)
                .populate('shop', 'name')
                .populate('category', 'name')
                .populate('brand', 'name');

            recommendations = [...productsFromSimilarCategories, ...popularProducts].slice(0, 10);
        } else {
            recommendations = productsFromSimilarCategories;
        }

        res.status(200).json({
            success: true,
            message: req.t('user.recommendationsRetrieved'),
            data: recommendations
        });

    } catch (error) {
        next(error);
    }
};


// --- Admin-only functions (unchanged) ---

exports.getUsers = async (req, res, next) => {
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

exports.getUserById = async (req, res, next) => {
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

exports.updateUserRole = async (req, res, next) => {
    try {
        const { error, value } = require('../controllers/adminController').updateUserRoleSchema.validate(req.body); // Utilise le schéma de l'admin
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

exports.deleteUserById = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return next(new AppError('admin.userNotFound', 404));
        }

        await user.deleteOne();

        res.status(200).json({
            success: true,
            message: req.t('admin.userDeleted')
        });
    } catch (error) {
        next(error);
    }
};
