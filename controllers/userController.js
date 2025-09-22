// 5kl-backend/controllers/userController.js
const User = require('../models/User');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const Product = require('../models/Product');
const AdminMessage = require('../models/AdminMessage');
const ProductVariation = require('../models/ProductVariation');
const Notification = require('../models/Notification');
const { sendNotification } = require('../utils/notificationService');
const Joi = require('joi');
const AppError = require('../utils/appError');
const { upload, cloudinary } = require('../utils/cloudinary'); // <-- TRÈS IMPORTANT : S'assurer que 'upload' et 'cloudinary' sont bien importés
const { SUPPORTED_LOCALES } = require('../utils/i18n');


// --- Validation schemas (inchangés) ---
const updateUserSchema = Joi.object({
    username: Joi.string().min(3).max(30).optional(),
    firstName: Joi.string().optional(),
    lastName: Joi.string().optional(),
    phone: Joi.string().optional(),
    whatsappNumber: Joi.string().pattern(/^\+?\d{8,15}$/).optional().allow(null, ''),
    whatsappNotificationsEnabled: Joi.boolean().optional(),
    locale: Joi.string().valid(...SUPPORTED_LOCALES).optional(),
});

const addressSchema = Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zipCode: Joi.string().required(),
    country: Joi.string().required(),
    isDefault: Joi.boolean().optional().default(false)
});

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
        res.status(200).json({
            success: true,
            data: req.user
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
        if (value.whatsappNumber !== undefined) user.whatsappNumber = value.whatsappNumber;
        if (value.whatsappNotificationsEnabled !== undefined) user.whatsappNotificationsEnabled = value.whatsappNotificationsEnabled;
        if (value.locale) user.locale = value.locale;

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

        const user = await User.findById(req.user.id).select('+password');

        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        if (!user.password) {
            return next(new AppError('user.passwordUpdateForbidden', 403));
        }

        if (!(await user.correctPassword(currentPassword, user.password))) {
            return next(new AppError('auth.currentPasswordInvalid', 401));
        }

        user.password = newPassword;
        await user.save();

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

        const orders = await Order.find({
            user: userId,
            ...(req.user.orderHistoryArchivedAt && { createdAt: { $gt: req.user.orderHistoryArchivedAt } })
        })
        .sort('-createdAt')
        .limit(limit)
        .skip(skip)
        .populate({
            path: 'items.productVariation',
            populate: { path: 'product', select: 'name images' }
        });

        const totalOrders = await Order.countDocuments({
            user: userId,
            ...(req.user.orderHistoryArchivedAt && { createdAt: { $gt: req.user.orderHistoryArchivedAt } })
        });


        const offers = await Offer.find({
            buyer: userId,
            ...(req.user.offerHistoryArchivedAt && { createdAt: { $gt: req.user.offerHistoryArchivedAt } })
        })
        .sort('-lastActivity')
        .limit(limit)
        .skip(skip)
        .populate({
            path: 'productVariation',
            populate: { path: 'product', select: 'name images' }
        });

        const totalOffers = await Offer.countDocuments({
            buyer: userId,
            ...(req.user.offerHistoryArchivedAt && { createdAt: { $gt: req.user.offerHistoryArchivedAt } })
        });


        res.status(200).json({
            success: true,
            message: req.t('user.dashboardRetrieved'),
            data: {
                profile: req.user,
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

        const ordersToArchive = await Order.countDocuments({
            user: userId,
            status: { $in: ['delivered', 'cancelled', 'returned', 'rejected'] },
            ...(req.user.orderHistoryArchivedAt && { createdAt: { $gt: req.user.orderHistoryArchivedAt } })
        });

        if (ordersToArchive === 0) {
            return next(new AppError('user.noHistoryToDelete', 404));
        }

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
        const user = await User.findById(userId);

        let recommendations = [];

        const lastViewedVariationsIds = user.lastViewedVariations
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3)
            .map(item => item.variation);

        let variationsFromSimilarCategories = [];
        if (lastViewedVariationsIds.length > 0) {
            const viewedVariations = await ProductVariation.find({ _id: { $in: lastViewedVariationsIds } }).populate('product');
            const categories = [...new Set(viewedVariations.map(v => v.product.category.toString()))];

            variationsFromSimilarCategories = await ProductVariation.find({
                'product.category': { $in: categories },
                _id: { $nin: lastViewedVariationsIds },
                isAvailable: true
            })
            .limit(5)
            .populate('product', 'name shop images')
            .populate('product.shop', 'name')
            .populate('product.category', 'name')
            .populate('product.brand', 'name');
        }

        if (variationsFromSimilarCategories.length < 5) {
            const popularVariations = await ProductVariation.find({ isAvailable: true, _id: { $nin: lastViewedVariationsIds } })
                .sort('-createdAt')
                .limit(10)
                .populate('product', 'name shop images')
                .populate('product.shop', 'name')
                .populate('product.category', 'name')
                .populate('product.brand', 'name');

            recommendations = [...variationsFromSimilarCategories, ...popularVariations].slice(0, 10);
        } else {
            recommendations = variationsFromSimilarCategories;
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

/**
 * @desc    Obtenir les messages envoyés par l'admin à l'utilisateur ou à son rôle (Notifications In-App)
 * @route   GET /api/users/me/notifications
 * @access  Private (User)
 */
exports.getAdminMessages = async (req, res, next) => { // Renommée en getNotifications pour plus de clarté
    try {
        const userId = req.user.id;
        // const userRoles = req.user.roles; // Plus nécessaire car le service de notification a déjà filtré
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const query = {
            recipient: userId, // La notification est spécifiquement pour cet utilisateur
        };

        const notifications = await Notification.find(query)
            .populate('sender', 'username email')
            .sort('-sentAt')
            .skip(skip)
            .limit(limit);

        const totalNotifications = await Notification.countDocuments(query);

        res.status(200).json({
            success: true,
            message: req.t('user.notificationsRetrieved'),
            count: notifications.length,
            total: totalNotifications,
            page,
            pages: Math.ceil(totalNotifications / limit),
            data: notifications
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Marquer une notification comme lue
 * @route   PUT /api/users/me/notifications/:id/read
 * @access  Private (User)
 */
exports.markNotificationAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: req.user.id }, // S'assurer que l'utilisateur est le destinataire
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return next(new AppError('user.notificationNotFound', 404));
        }

        res.status(200).json({
            success: true,
            message: req.t('user.markNotificationReadSuccess'),
            data: notification
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Effacer toutes les notifications de l'utilisateur
 * @route   DELETE /api/users/me/notifications
 * @access  Private (User)
 */
exports.clearAllNotifications = async (req, res, next) => {
    try {
        await Notification.deleteMany({ recipient: req.user.id });

        res.status(200).json({
            success: true,
            message: req.t('user.clearAllNotificationsSuccess')
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour les préférences de notifications WhatsApp de l'utilisateur
 * @route   PUT /api/users/me/whatsapp-preferences
 * @access  Private (User)
 */
exports.updateWhatsappPreferences = async (req, res, next) => {
    try {
        const { whatsappNumber, whatsappNotificationsEnabled, locale } = req.body; // AJOUTÉ : locale pour la MAJ

        // Validation des champs reçus
        const validationSchema = Joi.object({
            whatsappNumber: Joi.string().pattern(/^\+?\d{8,15}$/).optional().allow(null, ''),
            whatsappNotificationsEnabled: Joi.boolean().optional(),
            locale: Joi.string().valid(...SUPPORTED_LOCALES).optional(), // AJOUTÉ : Validation de la locale
        }).min(1); // Au moins un champ doit être fourni

        const { error, value } = validationSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        let updated = false;
        if (value.whatsappNumber !== undefined) {
            user.whatsappNumber = value.whatsappNumber;
            updated = true;
        }
        if (value.whatsappNotificationsEnabled !== undefined) {
            user.whatsappNotificationsEnabled = value.whatsappNotificationsEnabled;
            updated = true;
        }
        if (value.locale !== undefined) { // AJOUTÉ : Mise à jour de la locale
            user.locale = value.locale;
            updated = true;
        }

        if (!updated) {
            return next(new AppError('errors.validationError', 400, ['Aucune préférence WhatsApp ou locale valide fournie.']));
        }

        await user.save({ validateBeforeSave: true }); // Valider avec tous les validateurs

        res.status(200).json({
            success: true,
            message: req.t('user.whatsappPreferencesUpdated'),
            data: {
                whatsappNumber: user.whatsappNumber,
                whatsappNotificationsEnabled: user.whatsappNotificationsEnabled,
                locale: user.locale
            }
        });

    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Upload et mise à jour de la photo de profil de l'utilisateur
 * @route   PUT /api/users/me/profile-picture
 * @access  Private (User)
 */
exports.uploadProfilePicture = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new AppError('errors.noFileUploaded', 400));
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        if (user.profilePicture) {
            const publicId = user.profilePicture.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`5kl_user_profile_pictures/${publicId}`);
        }

        user.profilePicture = req.file.path;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: req.t('user.profilePictureUploaded'),
            data: user.profilePicture
        });

    } catch (error) {
        if (error.message && error.message.includes('file type')) {
            return next(new AppError('errors.invalidFileType', 400));
        }
        if (error.message && error.message.includes('File too large')) {
            return next(new AppError('errors.fileUploadFailed', 400, ['5MB']));
        }
        next(error);
    }
};

/**
 * @desc    Supprimer la photo de profil de l'utilisateur
 * @route   DELETE /api/users/me/profile-picture
 * @access  Private (User)
 */
exports.deleteProfilePicture = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return next(new AppError('user.notFound', 404));
        }

        if (!user.profilePicture) {
            return next(new AppError('user.noProfilePicture', 404));
        }

        const publicId = user.profilePicture.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`5kl_user_profile_pictures/${publicId}`);

        user.profilePicture = undefined;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: req.t('user.profilePictureDeleted')
        });

    } catch (error) {
        next(error);
    }
};


// --- Admin-only functions (inchangé) ---

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
        const { error, value } = require('../controllers/adminController').updateUserRoleSchema.validate(req.body);
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