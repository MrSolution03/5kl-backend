// 5kl-backend/controllers/shopController.js
const Shop = require('../models/Shop');
const User = require('../models/User'); // Pour vérifier le rôle du propriétaire
const Product = require('../models/Product'); // Pour vérifier les produits liés avant suppression
const Joi = require('joi');
const AppError = require('../utils/appError');
const { upload, cloudinary } = require('../utils/cloudinary'); // Pour gérer les uploads

// --- Schemas de Validation Joi ---

const createShopSchema = Joi.object({
    name: Joi.string().trim().min(3).max(100).required(),
    description: Joi.string().trim().max(500).optional().allow(null, ''),
    address: Joi.object({
        street: Joi.string().trim().required(),
        city: Joi.string().trim().required(),
        state: Joi.string().trim().required(),
        zipCode: Joi.string().trim().required(),
        country: Joi.string().trim().required()
    }).optional(),
    phone: Joi.string().trim().optional().allow(null, ''),
    email: Joi.string().email().trim().lowercase().optional().allow(null, '')
}).options({ stripUnknown: true });

const updateShopSchema = Joi.object({
    name: Joi.string().trim().min(3).max(100).optional(),
    description: Joi.string().trim().max(500).optional().allow(null, ''),
    address: Joi.object({
        street: Joi.string().trim().optional(),
        city: Joi.string().trim().optional(),
        state: Joi.string().trim().optional(),
        zipCode: Joi.string().trim().optional(),
        country: Joi.string().trim().optional()
    }).optional(),
    phone: Joi.string().trim().optional().allow(null, ''),
    email: Joi.string().email().trim().lowercase().optional().allow(null, ''),
    isActive: Joi.boolean().optional(),
    isApproved: Joi.boolean().optional() // Admin only for this field
}).options({ stripUnknown: true });

// --- Fonctions des Contrôleurs ---

/**
 * @desc    Créer une nouvelle boutique
 * @route   POST /api/shops
 * @access  Private (Seller or Admin)
 */
exports.createShop = async (req, res, next) => {
    try {
        const { error, value } = createShopSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { name } = value;

        // Vérifier si un vendeur a déjà une boutique (un seul par vendeur)
        const existingShopForUser = await Shop.findOne({ owner: req.user.id });
        if (existingShopForUser) {
            return next(new AppError('shop.alreadyOwnsShop', 400)); // Nouvelle clé à ajouter
        }

        // Vérifier l'unicité du nom de la boutique
        const existingShopWithName = await Shop.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingShopWithName) {
            return next(new AppError('shop.nameUnique', 400));
        }

        // Assurez-vous que l'utilisateur est un vendeur. Le middleware du modèle Shop le fera aussi.
        const user = await User.findById(req.user.id);
        if (!user.roles.includes('seller')) {
            user.roles.push('seller');
            await user.save({ validateBeforeSave: false }); // Éviter la validation du password qui est select: false
        }

        const shop = await Shop.create({
            ...value,
            owner: req.user.id,
            isApproved: req.user.roles.includes('admin') ? true : false // Approuvée automatiquement si créée par un admin
        });

        // Lier la boutique à l'utilisateur
        user.shop = shop._id;
        await user.save({ validateBeforeSave: false });

        res.status(201).json({
            success: true,
            message: req.t('shop.created'), // Nouvelle clé
            data: shop,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les boutiques (publiques, donc seulement celles approuvées)
 * @route   GET /api/shops
 * @access  Public
 */
exports.getShops = async (req, res, next) => {
    try {
        const shops = await Shop.find({ isApproved: true, isActive: true })
            .populate('owner', 'username email'); // Afficher info du propriétaire

        res.status(200).json({
            success: true,
            count: shops.length,
            data: shops,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir une boutique par ID (publique, seulement si approuvée et active)
 * @route   GET /api/shops/:id
 * @access  Public
 */
exports.getShopById = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ _id: req.params.id, isApproved: true, isActive: true })
            .populate('owner', 'username email');

        if (!shop) {
            return next(new AppError('shop.notFound', 404));
        }

        res.status(200).json({
            success: true,
            data: shop,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour une boutique
 * @route   PUT /api/shops/:id
 * @access  Private (Seller owner or Admin)
 */
exports.updateShop = async (req, res, next) => {
    try {
        const { error, value } = updateShopSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        let shop = await Shop.findById(req.params.id);

        if (!shop) {
            return next(new AppError('shop.notFound', 404));
        }

        // Vérifier l'autorisation
        const isOwner = shop.owner.toString() === req.user.id;
        const isAdmin = req.user.roles.includes('admin');

        if (!isOwner && !isAdmin) {
            return next(new AppError('shop.forbidden', 403)); // Nouvelle clé
        }

        // Un vendeur ne peut pas modifier l'approbation
        if (isOwner && value.isApproved !== undefined && value.isApproved !== shop.isApproved) {
            return next(new AppError('shop.approvalForbidden', 403)); // Nouvelle clé
        }
        // Un vendeur ne peut pas non plus modifier l'activité s'il n'est pas admin, s'il y a une politique stricte
        // Pour l'instant, un propriétaire peut activer/désactiver sa propre boutique.

        // Vérifier l'unicité du nom si modifié
        if (value.name && value.name !== shop.name) {
            const existingShopWithName = await Shop.findOne({ name: { $regex: new RegExp(`^${value.name}$`, 'i') } });
            if (existingShopWithName && existingShopWithName._id.toString() !== shop._id.toString()) {
                return next(new AppError('shop.nameUnique', 400));
            }
        }

        Object.assign(shop, value);
        await shop.save({ runValidators: true });

        res.status(200).json({
            success: true,
            message: req.t('shop.updated'), // Nouvelle clé
            data: shop,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Supprimer une boutique
 * @route   DELETE /api/shops/:id
 * @access  Private (Admin only)
 */
exports.deleteShop = async (req, res, next) => {
    try {
        const shop = await Shop.findById(req.params.id);

        if (!shop) {
            return next(new AppError('shop.notFound', 404));
        }

        // Uniquement l'admin peut supprimer une boutique
        if (!req.user.roles.includes('admin')) {
            return next(new AppError('shop.forbidden', 403));
        }

        // Vérifier s'il y a des produits liés à cette boutique
        const productsCount = await Product.countDocuments({ shop: shop._id });
        if (productsCount > 0) {
            return next(new AppError('shop.deleteForbiddenProductsExist', 400)); // Nouvelle clé
        }

        // Si la boutique a un logo, le supprimer de Cloudinary
        if (shop.logo) {
            const publicId = shop.logo.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);
        }

        await shop.deleteOne();

        // Dissocier la boutique de l'utilisateur (si c'était un vendeur)
        await User.findByIdAndUpdate(shop.owner, { $unset: { shop: 1 } }); // Supprime le champ 'shop'

        res.status(200).json({
            success: true,
            message: req.t('shop.deleted'), // Nouvelle clé
        });
    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Obtenir les produits d'une boutique spécifique (publique)
 * @route   GET /api/shops/:id/products
 * @access  Public
 */
exports.getShopProducts = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ _id: req.params.id, isApproved: true, isActive: true });
        if (!shop) {
            return next(new AppError('shop.notFound', 404));
        }

        const products = await Product.find({ shop: shop._id, isAvailable: true })
            .populate('category', 'name slug')
            .populate('brand', 'name logo');

        res.status(200).json({
            success: true,
            count: products.length,
            data: products,
        });
    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Télécharger le logo d'une boutique
 * @route   PUT /api/shops/:id/logo
 * @access  Private (Seller owner or Admin)
 */
exports.uploadShopLogo = async (req, res, next) => {
    try {
        const shop = await Shop.findById(req.params.id);

        if (!shop) {
            return next(new AppError('shop.notFound', 404));
        }

        // Vérifier l'autorisation
        const isOwner = shop.owner.toString() === req.user.id;
        const isAdmin = req.user.roles.includes('admin');
        if (!isOwner && !isAdmin) {
            return next(new AppError('shop.forbidden', 403));
        }

        if (!req.file) {
            return next(new AppError('errors.noFileUploaded', 400));
        }

        // Si un ancien logo existe, le supprimer de Cloudinary
        if (shop.logo) {
            const publicId = shop.logo.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);
        }

        shop.logo = req.file.path; // req.file.path est l'URL de Cloudinary
        await shop.save();

        res.status(200).json({
            success: true,
            message: req.t('shop.logoUploaded'), // Nouvelle clé
            data: shop.logo,
        });
    } catch (error) {
        // Multer/Cloudinary errors might be caught here
        if (error.message && error.message.includes('file type')) {
            return next(new AppError('errors.invalidFileType', 400));
        }
        if (error.message && error.message.includes('File too large')) {
            return next(new AppError('errors.fileUploadFailed', 400, ['5MB']));
        }
        next(error);
    }
};