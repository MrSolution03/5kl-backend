// 5kl-backend/controllers/sellerController.js
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const ProductVariation = require('../models/ProductVariation'); // AJOUTÉ
const StockMovement = require('../models/StockMovement');     // AJOUTÉ
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const AppError = require('../utils/appError');
const Joi = require('joi');
const { upload, cloudinary } = require('../utils/cloudinary');
const User = require('../models/User');

// --- Schemas de Validation Joi (inchangés pour Shop) ---
const shopSchema = Joi.object({
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
    isActive: Joi.boolean().optional()
}).options({ stripUnknown: true });

// Schéma pour le produit parent (sans prix ni stock)
const productSchema = Joi.object({
    name: Joi.string().trim().min(3).max(255).required(),
    description: Joi.string().trim().min(10).max(2000).required(),
    images: Joi.array().items(Joi.string().uri()).optional().default([]),
    category: Joi.string().hex().length(24).required(),
    subCategory: Joi.string().hex().length(24).optional().allow(null, ''),
    brand: Joi.string().hex().length(24).optional().allow(null, ''),
    attributes: Joi.array().items(Joi.object({
        key: Joi.string().trim().required(),
        value: Joi.string().trim().required()
    })).optional().default([]),
});

// Schéma pour une variation de produit
const productVariationSchema = Joi.object({
    sku: Joi.string().trim().alphanum().min(3).max(50).required(),
    attributes: Joi.array().items(Joi.object({
        key: Joi.string().trim().required(),
        value: Joi.string().trim().required()
    })).min(1).required(),
    price: Joi.number().min(0.01).required(),
    stock: Joi.number().integer().min(0).required(),
    images: Joi.array().items(Joi.string().uri()).optional().default([]),
    isAvailable: Joi.boolean().optional().default(true),
    lowStockThreshold: Joi.number().integer().min(0).optional().default(10)
});

// Schéma pour la mise à jour d'une variation
const updateProductVariationSchema = Joi.object({
    sku: Joi.string().trim().alphanum().min(3).max(50).optional(),
    attributes: Joi.array().items(Joi.object({
        key: Joi.string().trim().required(),
        value: Joi.string().trim().required()
    })).min(1).optional(),
    price: Joi.number().min(0.01).optional(),
    stock: Joi.number().integer().min(0).optional(),
    isAvailable: Joi.boolean().optional(),
    lowStockThreshold: Joi.number().integer().min(0).optional()
}).options({ stripUnknown: true });

// Schéma pour les mouvements de stock
const stockMovementSchema = Joi.object({
    type: Joi.string().valid('in', 'out', 'adjustment').required(),
    quantity: Joi.number().integer().min(1).required(),
    reason: Joi.string().min(3).required(),
    reference: Joi.string().optional().allow(null, '')
});


// --- Fonctions des Contrôleurs ---

/**
 * @desc    Obtenir les statistiques du tableau de bord du vendeur
 * @route   GET /api/seller/dashboard
 * @access  Private (Seller)
 */
exports.getSellerDashboard = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ owner: req.user.id });
        if (!shop) {
            return next(new AppError('seller.shopNotFound', 404));
        }

        const totalProducts = await Product.countDocuments({ shop: shop._id });
        // Le calcul de totalOrders et totalOffers doit tenir compte des variations maintenant
        const productVariationsInShop = await ProductVariation.find({ product: { $in: shop.products } }).select('_id');
        const variationIds = productVariationsInShop.map(v => v._id);

        const totalOrders = await Order.countDocuments({ 'items.productVariation': { $in: variationIds } });
        const totalOffers = await Offer.countDocuments({ productVariation: { $in: variationIds } });

        const sales = await Order.aggregate([
            { $match: { 'items.productVariation': { $in: variationIds }, status: 'delivered' } },
            { $unwind: '$items' },
            { $match: { 'items.productVariation': { $in: variationIds } } },
            { $group: { _id: null, totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.pricePaid'] } } } }
        ]);
        const totalRevenue = sales.length > 0 ? sales[0].totalRevenue : 0;


        res.status(200).json({
            success: true,
            message: req.t('seller.dashboardStats'),
            data: {
                shop: shop.name,
                totalProducts,
                totalOrders,
                totalOffers,
                totalRevenue
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Créer la boutique du vendeur (un seul par vendeur)
 * @route   POST /api/seller/shop
 * @access  Private (Seller)
 */
exports.createShop = async (req, res, next) => {
    try {
        const existingShop = await Shop.findOne({ owner: req.user.id });
        if (existingShop) {
            return next(new AppError('shop.alreadyOwnsShop', 400));
        }

        const { error, value } = shopSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { name } = value;

        const existingShopWithName = await Shop.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingShopWithName) {
            return next(new AppError('shop.nameUnique', 400));
        }

        const user = await User.findById(req.user.id);
        if (!user.roles.includes('seller')) {
            user.roles.push('seller');
            await user.save({ validateBeforeSave: false });
        }

        const shop = await Shop.create({
            ...value,
            owner: req.user.id,
            isApproved: false
        });

        await User.findByIdAndUpdate(req.user.id, { shop: shop._id });

        res.status(201).json({
            success: true,
            message: req.t('seller.shopCreated'),
            data: shop
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir les détails de la boutique du vendeur
 * @route   GET /api/seller/shop
 * @access  Private (Seller)
 */
exports.getOwnShop = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ owner: req.user.id }).populate('owner', 'username email');
        if (!shop) {
            return next(new AppError('seller.shopNotFound', 404));
        }

        res.status(200).json({
            success: true,
            data: shop
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour les détails de la boutique du vendeur
 * @route   PUT /api/seller/shop
 * @access  Private (Seller)
 */
exports.updateOwnShop = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ owner: req.user.id });
        if (!shop) {
            return next(new AppError('seller.shopNotFound', 404));
        }

        const { error, value } = updateShopSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        if (value.isApproved !== undefined) {
            return next(new AppError('shop.approvalForbidden', 403));
        }

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
            message: req.t('seller.shopUpdated'),
            data: shop
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Télécharger le logo de la boutique du vendeur
 * @route   PUT /api/seller/shop/logo
 * @access  Private (Seller)
 */
exports.uploadShopLogo = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ owner: req.user.id });
        if (!shop) {
            return next(new AppError('seller.shopNotFound', 404));
        }

        if (!req.file) {
            return next(new AppError('errors.noFileUploaded', 400));
        }

        if (shop.logo) {
            const publicId = shop.logo.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);
        }

        shop.logo = req.file.path;
        await shop.save();

        res.status(200).json({
            success: true,
            message: req.t('seller.logoUploaded'),
            data: shop.logo,
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
 * @desc    Créer un nouveau produit parent pour sa boutique
 * @route   POST /api/seller/products
 * @access  Private (Seller)
 */
exports.createProduct = async (req, res, next) => {
    req.body.shop = req.user.shop;
    return require('./productController').createProduct(req, res, next);
};

/**
 * @desc    Obtenir tous les produits parents de sa boutique
 * @route   GET /api/seller/products?page=1&limit=10
 * @access  Private (Seller)
 */
exports.getShopProducts = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ owner: req.user.id });
        if (!shop) {
            return next(new AppError('seller.shopNotFound', 404));
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const products = await Product.find({ shop: shop._id })
            .populate('category', 'name slug')
            .populate('brand', 'name logo')
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments({ shop: shop._id });

        res.status(200).json({
            success: true,
            message: req.t('seller.productsRetrieved'),
            count: products.length,
            total: totalProducts,
            page,
            pages: Math.ceil(totalProducts / limit),
            data: products
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour un de ses produits parents
 * @route   PUT /api/seller/products/:id
 * @access  Private (Seller)
 */
exports.updateProduct = async (req, res, next) => {
    return require('./productController').updateProduct(req, res, next);
};

/**
 * @desc    Supprimer un de ses produits parents
 * @route   DELETE /api/seller/products/:id
 * @access  Private (Seller)
 */
exports.deleteProduct = async (req, res, next) => {
    return require('./productController').deleteProduct(req, res, next);
};

/**
 * @desc    Télécharger des images générales pour un de ses produits
 * @route   POST /api/seller/products/:id/images
 * @access  Private (Seller)
 */
exports.uploadProductImages = async (req, res, next) => {
    return require('./productController').uploadProductImages(req, res, next);
};

/**
 * @desc    Supprimer une image générale de son produit
 * @route   DELETE /api/seller/products/:id/images/:imageId
 * @access  Private (Seller)
 */
exports.removeProductImage = async (req, res, next) => {
    return require('./productController').removeProductImage(req, res, next);
};

// --- AJOUTÉ : Gestion des Variations de Produits par le Vendeur ---

/**
 * @desc    Créer une variation pour un produit de sa boutique
 * @route   POST /api/seller/products/:productId/variations
 * @access  Private (Seller owner of product)
 */
exports.createProductVariation = async (req, res, next) => {
    // Le productController.createProductVariation contient déjà les vérifications d'autorisation
    return require('./productController').createProductVariation(req, res, next);
};

/**
 * @desc    Obtenir toutes les variations d'un produit de sa boutique
 * @route   GET /api/seller/products/:productId/variations
 * @access  Private (Seller owner of product)
 */
exports.getProductVariations = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const product = await Product.findById(productId);
        if (!product || product.shop.toString() !== req.user.shop.toString()) {
            return next(new AppError('seller.productNotFound', 404)); // S'assurer que le produit appartient au vendeur
        }
        // Utilise la fonction publique du productController, mais assure la propriété via le middleware.
        return require('./productController').getProductVariations(req, res, next);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir une variation spécifique par ID de sa boutique
 * @route   GET /api/seller/product-variations/:id
 * @access  Private (Seller owner of product)
 */
exports.getProductVariationById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const variation = await ProductVariation.findById(id).populate('product', 'shop');
        if (!variation || variation.product.shop.toString() !== req.user.shop.toString()) {
            return next(new AppError('seller.variationNotFound', 404)); // S'assurer que la variation appartient au vendeur
        }
        return require('./productController').getProductVariationById(req, res, next);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour une variation de produit de sa boutique
 * @route   PUT /api/seller/product-variations/:id
 * @access  Private (Seller owner of product)
 */
exports.updateProductVariation = async (req, res, next) => {
    return require('./productController').updateProductVariation(req, res, next);
};

/**
 * @desc    Supprimer une variation de produit de sa boutique
 * @route   DELETE /api/seller/product-variations/:id
 * @access  Private (Seller owner of product)
 */
exports.deleteProductVariation = async (req, res, next) => {
    return require('./productController').deleteProductVariation(req, res, next);
};

/**
 * @desc    Télécharger des images pour une variation de produit de sa boutique
 * @route   POST /api/seller/product-variations/:id/images
 * @access  Private (Seller owner of product)
 */
exports.uploadProductVariationImages = async (req, res, next) => {
    return require('./productController').uploadProductVariationImages(req, res, next);
};

/**
 * @desc    Supprimer une image spécifique d'une variation de produit de sa boutique
 * @route   DELETE /api/seller/product-variations/:id/images/:imageId
 * @access  Private (Seller owner of product)
 */
exports.removeProductVariationImage = async (req, res, next) => {
    return require('./productController').removeProductVariationImage(req, res, next);
};

/**
 * @desc    Enregistrer un mouvement de stock pour une variation de sa boutique
 * @route   POST /api/seller/product-variations/:id/stock-movements
 * @access  Private (Seller owner of product)
 */
exports.recordStockMovement = async (req, res, next) => {
    return require('./productController').recordStockMovement(req, res, next);
};

/**
 * @desc    Obtenir l'historique des mouvements de stock pour une variation de sa boutique
 * @route   GET /api/seller/product-variations/:id/stock-movements
 * @access  Private (Seller owner of product)
 */
exports.getStockMovements = async (req, res, next) => {
    return require('./productController').getStockMovements(req, res, next);
};


// --- Commandes et offres liées à la boutique du vendeur (inchangé, populera les variations maintenant) ---

/**
 * @desc    Obtenir les commandes qui concernent sa boutique
 * @route   GET /api/seller/orders?page=1&limit=10
 * @access  Private (Seller)
 */
exports.getShopOrders = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ owner: req.user.id });
        if (!shop) {
            return next(new AppError('seller.shopNotFound', 404));
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const productVariationsInShop = await ProductVariation.find({ product: { $in: shop.products } }).select('_id');
        const variationIds = productVariationsInShop.map(v => v._id);

        const orders = await Order.find({ 'items.productVariation': { $in: variationIds } })
            .populate('user', 'username email')
            .populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' }
            })
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments({ 'items.productVariation': { $in: variationIds } });

        res.status(200).json({
            success: true,
            message: req.t('seller.ordersRetrieved'),
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
 * @desc    Obtenir les offres de prix pour ses produits
 * @route   GET /api/seller/offers?page=1&limit=10
 * @access  Private (Seller)
 */
exports.getShopOffers = async (req, res, next) => {
    try {
        const shop = await Shop.findOne({ owner: req.user.id });
        if (!shop) {
            return next(new AppError('seller.shopNotFound', 404));
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const productVariationsInShop = await ProductVariation.find({ product: { $in: shop.products } }).select('_id');
        const variationIds = productVariationsInShop.map(v => v._id);

        const offers = await Offer.find({ productVariation: { $in: variationIds } })
            .populate('buyer', 'username email')
            .populate({
                path: 'productVariation',
                populate: { path: 'product', select: 'name images' }
            })
            .skip(skip)
            .limit(limit);

        const totalOffers = await Offer.countDocuments({ productVariation: { $in: variationIds } });

        res.status(200).json({
            success: true,
            message: req.t('seller.offersRetrieved'),
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