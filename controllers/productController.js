// 5kl-backend/controllers/productController.js
const Product = require('../models/Product');
const ProductVariation = require('../models/ProductVariation');
const StockMovement = require('../models/StockMovement');
const Shop = require('../models/Shop');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const User = require('../models/User');
const CurrencyRate = require('../models/CurrencyRate');
const AppError = require('../utils/appError');
const Joi = require('joi'); 
const { upload, cloudinary } = require('../utils/cloudinary'); 
const { SUPPORTED_CURRENCIES } = require('../utils/i18n');


// --- Schemas de Validation Joi ---

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

const stockMovementSchema = Joi.object({
    type: Joi.string().valid('in', 'out', 'adjustment').required(),
    quantity: Joi.number().integer().min(1).required(),
    reason: Joi.string().min(3).required(),
    reference: Joi.string().optional().allow(null, '')
});


const categorySchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    parentCategory: Joi.string().hex().length(24).optional().allow(null, ''),
    description: Joi.string().trim().max(500).optional().allow(null, ''),
    image: Joi.string().uri().optional().allow(null, '')
});

const brandSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    description: Joi.string().trim().max(500).optional().allow(null, ''),
    logo: Joi.string().uri().optional().allow(null, '')
});


// --- Fonctions Utilitaires pour la Devise ---
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
 * @desc    Créer un nouveau produit (le produit parent, sans variations initiales)
 * @route   POST /api/products
 * @access  Private (Seller only)
 */
exports.createProduct = async (req, res, next) => {
    try {
        const { error, value } = productSchema.validate(req.body, { abortEarly: false });
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { name, description, images, category, subCategory, brand, attributes } = value;

        const shop = await Shop.findOne({ owner: req.user.id, isApproved: true });
        if (!shop) {
            return next(new AppError('product.shopNotFound', 404));
        }

        const foundCategory = await Category.findById(category);
        if (!foundCategory) {
            return next(new AppError('product.categoryNotFound', 400));
        }

        if (subCategory) {
            const foundSubCategory = await Category.findById(subCategory);
            if (!foundSubCategory || (foundSubCategory.parentCategory && foundSubCategory.parentCategory.toString() !== category)) {
                return next(new AppError('product.invalidCategory', 400));
            }
        }

        if (brand) {
            const foundBrand = await Brand.findById(brand);
            if (!foundBrand) {
                return next(new AppError('product.brandNotFound', 400));
            }
        }

        const product = await Product.create({
            name,
            description,
            images,
            category,
            subCategory,
            brand,
            attributes,
            shop: shop._id,
        });

        shop.products.push(product._id);
        await shop.save();

        res.status(201).json({
            success: true,
            message: req.t('product.created'),
            data: product,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir tous les produits (avec filtres, recherche, pagination, tri, conversion de devise)
 * @route   GET /api/products?targetCurrency=USD
 * @access  Public
 */
exports.getProducts = async (req, res, next) => {
    try {
        let query = {};
        const { name, category, subCategory, brand, shop, minPrice, maxPrice, isAvailable, sortBy, page = 1, limit = 10, targetCurrency = 'FC', ...filterAttributes } = req.query;

        if (!SUPPORTED_CURRENCIES.includes(targetCurrency)) {
            return next(new AppError('order.invalidCurrency', 400));
        }

        if (name) {
            query.$text = { $search: name };
        }

        if (category) {
            const cat = await Category.findOne({ $or: [{ _id: category }, { slug: category }] });
            if (!cat) return next(new AppError('product.categoryNotFound', 404));
            query.category = cat._id;
        }

        if (subCategory) {
            const subCat = await Category.findOne({ $or: [{ _id: subCategory }, { slug: subCategory }] });
            if (!subCat) return next(new AppError('product.categoryNotFound', 404));
            query.subCategory = subCat._id;
        }

        if (brand) {
            const br = await Brand.findOne({ $or: [{ _id: brand }, { name: { $regex: brand, $options: 'i' } }] });
            if (!br) return next(new AppError('product.brandNotFound', 404));
            query.brand = br._id;
        }

        if (shop) {
            const shp = await Shop.findOne({ $or: [{ _id: shop }, { name: { $regex: shop, $options: 'i' } }] });
            if (!shp) return next(new AppError('product.shopNotFound', 404));
            query.shop = shp._id;
        }

        if (isAvailable !== undefined) {
            query.isAvailable = isAvailable === 'true';
        }

        if (minPrice || maxPrice) {
            query.minPrice = {};
            if (minPrice) query.minPrice.$gte = parseFloat(minPrice);
            if (maxPrice) query.maxPrice.$lte = parseFloat(maxPrice);
        }

        for (const key in filterAttributes) {
            if (!['page', 'limit', 'sortBy', 'name', 'category', 'subCategory', 'brand', 'shop', 'minPrice', 'maxPrice', 'isAvailable', 'targetCurrency'].includes(key)) {
                query[`attributes.key`] = key;
                query[`attributes.value`] = filterAttributes[key];
            }
        }


        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        let sort = {};
        if (sortBy) {
            const parts = sortBy.split(':');
            sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = -1;
        }

        const products = await Product.find(query)
            .populate('category', 'name slug')
            .populate('subCategory', 'name slug')
            .populate('brand', 'name logo')
            .populate('shop', 'name logo')
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const totalProducts = await Product.countDocuments(query);

        const convertedProducts = await Promise.all(products.map(async (product) => {
            const convertedMinPrice = await convertPrice(product.minPrice, targetCurrency, req);
            const convertedMaxPrice = await convertPrice(product.maxPrice, targetCurrency, req);
            return {
                ...product.toObject(),
                minPrice: parseFloat(convertedMinPrice.toFixed(2)),
                maxPrice: parseFloat(convertedMaxPrice.toFixed(2)),
                currency: targetCurrency
            };
        }));


        res.status(200).json({
            success: true,
            count: convertedProducts.length,
            total: totalProducts,
            page: pageNum,
            pages: Math.ceil(totalProducts / limitNum),
            data: convertedProducts,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir un produit par ID (avec ses variations et conversion de devise)
 * @route   GET /api/products/:id?targetCurrency=USD
 * @access  Public
 */
exports.getProductById = async (req, res, next) => {
    try {
        const { targetCurrency = 'FC' } = req.query;

        if (!SUPPORTED_CURRENCIES.includes(targetCurrency)) {
            return next(new AppError('order.invalidCurrency', 400));
        }

        const product = await Product.findById(req.params.id)
            .populate('category', 'name slug')
            .populate('subCategory', 'name slug')
            .populate('brand', 'name logo')
            .populate('shop', 'name logo');

        if (!product) {
            return next(new AppError('product.notFound', 404));
        }

        const variations = await ProductVariation.find({ product: product._id });

        if (req.user && req.user.id) {
            const user = await User.findById(req.user.id);
            if (user) {
                if (variations.length > 0) {
                     user.lastViewedVariations = user.lastViewedVariations.filter(
                        item => item.variation && item.variation.toString() !== variations[0]._id.toString()
                    );
                    user.lastViewedVariations.push({ variation: variations[0]._id, timestamp: Date.now() });
                    user.lastViewedVariations = user.lastViewedVariations.slice(-10);
                    await user.save({ validateBeforeSave: false });
                }
            }
        }

        const convertedVariations = await Promise.all(variations.map(async (variation) => {
            const convertedPrice = await convertPrice(variation.price, targetCurrency, req);
            return {
                ...variation.toObject(),
                price: parseFloat(convertedPrice.toFixed(2)),
                currency: targetCurrency
            };
        }));

        res.status(200).json({
            success: true,
            data: {
                ...product.toObject(),
                variations: convertedVariations,
                currency: targetCurrency
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour un produit (parent)
 * @route   PUT /api/products/:id
 * @access  Private (Seller owner or Admin)
 */
exports.updateProduct = async (req, res, next) => {
    try {
        const { error, value } = productSchema.validate(req.body, { abortEarly: false });
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        let product = await Product.findById(req.params.id);

        if (!product) {
            return next(new AppError('product.notFound', 404));
        }

        if (product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        if (value.category && value.category !== product.category.toString()) {
            const foundCategory = await Category.findById(value.category);
            if (!foundCategory) {
                return next(new AppError('product.categoryNotFound', 400));
            }
        }

        if (value.subCategory && value.subCategory !== product.subCategory?.toString()) {
            const foundSubCategory = await Category.findById(value.subCategory);
            if (!foundSubCategory || (value.category && foundSubCategory.parentCategory && foundSubCategory.parentCategory.toString() !== value.category) || (!value.category && foundSubCategory.parentCategory && foundSubCategory.parentCategory.toString() !== product.category.toString())) {
                return next(new AppError('product.invalidCategory', 400));
            }
        } else if (value.subCategory === null && product.subCategory) {
            product.subCategory = undefined;
        }

        if (value.brand && value.brand !== product.brand?.toString()) {
            const foundBrand = await Brand.findById(value.brand);
            if (!foundBrand) {
                return next(new AppError('product.brandNotFound', 400));
            }
        } else if (value.brand === null && product.brand) {
            product.brand = undefined;
        }

        product = await Product.findByIdAndUpdate(req.params.id, value, {
            new: true,
            runValidators: true,
        }).populate('category subCategory brand shop');

        await product.updateAggregatedData();


        res.status(200).json({
            success: true,
            message: req.t('product.updated'),
            data: product,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Supprimer un produit (et toutes ses variations, mouvements de stock)
 * @route   DELETE /api/products/:id
 * @access  Private (Seller owner or Admin)
 */
exports.deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return next(new AppError('product.notFound', 404));
        }

        if (product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        for (const imageUrl of product.images) {
            const publicId = imageUrl.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);
        }

        const variationsToDelete = await ProductVariation.find({ product: product._id });
        for (const variation of variationsToDelete) {
            for (const imageUrl of variation.images) {
                const publicId = imageUrl.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);
            }
            await StockMovement.deleteMany({ variation: variation._id });
            await variation.deleteOne();
        }

        await product.deleteOne();

        await Shop.findByIdAndUpdate(product.shop, { $pull: { products: product._id } });

        res.status(200).json({
            success: true,
            message: req.t('product.deleted'),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Télécharger des images générales pour un produit
 * @route   POST /api/products/:id/images
 * @access  Private (Seller owner or Admin)
 */
exports.uploadProductImages = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return next(new AppError('product.notFound', 404));
        }

        if (product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        if (!req.files || req.files.length === 0) {
            return next(new AppError('errors.noFileUploaded', 400));
        }

        const uploadedImageUrls = req.files.map(file => file.path);
        product.images.push(...uploadedImageUrls);
        await product.save();

        res.status(200).json({
            success: true,
            message: req.t('product.imagesUploaded', uploadedImageUrls.length),
            data: product.images,
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
 * @desc    Supprimer une image générale spécifique d'un produit
 * @route   DELETE /api/products/:id/images/:imageId
 * @access  Private (Seller owner or Admin)
 */
exports.removeProductImage = async (req, res, next) => {
    try {
        const { id, imageId } = req.params;

        const product = await Product.findById(id);

        if (!product) {
            return next(new AppError('product.notFound', 404));
        }

        if (product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        const imageUrlToRemove = product.images.find(url => url.includes(imageId));
        if (!imageUrlToRemove) {
            return next(new AppError('errors.imageNotFound', 404));
        }

        const publicId = imageUrlToRemove.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);

        product.images = product.images.filter(url => url !== imageUrlToRemove);
        await product.save();

        res.status(200).json({
            success: true,
            message: req.t('product.imageRemoved'),
            data: product.images,
        });
    } catch (error) {
        next(error);
    }
};


// --- Gestion des Variations de Produits ---

/**
 * @desc    Créer une nouvelle variation pour un produit
 * @route   POST /api/products/:productId/variations
 * @access  Private (Seller owner or Admin)
 */
exports.createProductVariation = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const { error, value } = productVariationSchema.validate(req.body, { abortEarly: false });
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const product = await Product.findById(productId);
        if (!product) {
            return next(new AppError('product.notFound', 404));
        }

        if (product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        const existingVariation = await ProductVariation.findOne({
            product: productId,
            'attributes': { $all: value.attributes.map(attr => ({ $elemMatch: attr })) }
        });

        if (existingVariation) {
            return next(new AppError('productVariation.alreadyExists', 400));
        }

        const variation = await ProductVariation.create({
            ...value,
            product: productId
        });

        await product.updateAggregatedData();


        res.status(201).json({
            success: true,
            message: req.t('productVariation.created'),
            data: variation
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les variations d'un produit spécifique
 * @route   GET /api/products/:productId/variations
 * @access  Public
 */
exports.getProductVariations = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const variations = await ProductVariation.find({ product: productId }).populate('product');

        if (!variations.length) {
            return next(new AppError('productVariation.notFound', 404));
        }

        res.status(200).json({
            success: true,
            count: variations.length,
            data: variations
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir une variation spécifique par ID
 * @route   GET /api/product-variations/:id?targetCurrency=USD
 * @access  Public
 */
exports.getProductVariationById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { targetCurrency = 'FC' } = req.query;

        if (!SUPPORTED_CURRENCIES.includes(targetCurrency)) {
            return next(new AppError('order.invalidCurrency', 400));
        }

        const variation = await ProductVariation.findById(id).populate('product', 'name shop');

        if (!variation) {
            return next(new AppError('productVariation.notFound', 404));
        }

        const convertedPrice = await convertPrice(variation.price, targetCurrency, req);

        const convertedVariation = {
            ...variation.toObject(),
            price: parseFloat(convertedPrice.toFixed(2)),
            currency: targetCurrency
        };

        if (req.user && req.user.id) {
            const user = await User.findById(req.user.id);
            if (user) {
                if (variation) {
                     user.lastViewedVariations = user.lastViewedVariations.filter(
                        item => item.variation && item.variation.toString() !== variation._id.toString()
                    );
                    user.lastViewedVariations.push({ variation: variation._id, timestamp: Date.now() });
                    user.lastViewedVariations = user.lastViewedVariations.slice(-10);
                    await user.save({ validateBeforeSave: false });
                }
            }
        }

        res.status(200).json({
            success: true,
            data: convertedVariation
        });

    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Mettre à jour une variation de produit
 * @route   PUT /api/product-variations/:id
 * @access  Private (Seller owner of product or Admin)
 */
exports.updateProductVariation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error, value } = updateProductVariationSchema.validate(req.body, { abortEarly: false });
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        let variation = await ProductVariation.findById(id).populate('product', 'shop');
        if (!variation) {
            return next(new AppError('productVariation.notFound', 404));
        }

        if (variation.product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        if (value.sku && value.sku !== variation.sku) {
            const existingVariation = await ProductVariation.findOne({ sku: value.sku });
            if (existingVariation && existingVariation._id.toString() !== variation._id.toString()) {
                return next(new AppError('productVariation.validation.skuUnique', 400));
            }
        }

        if (value.attributes && JSON.stringify(value.attributes) !== JSON.stringify(variation.attributes)) {
            const existingVariationWithAttributes = await ProductVariation.findOne({
                product: variation.product._id,
                'attributes': { $all: value.attributes.map(attr => ({ $elemMatch: attr })) },
                _id: { $ne: variation._id }
            });
            if (existingVariationWithAttributes) {
                return next(new AppError('productVariation.alreadyExists', 400));
            }
        }


        Object.assign(variation, value);
        await variation.save({ runValidators: true });

        await variation.product.updateAggregatedData();


        res.status(200).json({
            success: true,
            message: req.t('productVariation.updated'),
            data: variation
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Supprimer une variation de produit
 * @route   DELETE /api/product-variations/:id
 * @access  Private (Seller owner of product or Admin)
 */
exports.deleteProductVariation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const variation = await ProductVariation.findById(id).populate('product', 'shop');

        if (!variation) {
            return next(new AppError('productVariation.notFound', 404));
        }

        if (variation.product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        for (const imageUrl of variation.images) {
            const publicId = imageUrl.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);
        }

        await StockMovement.deleteMany({ variation: variation._id });
        await variation.deleteOne();

        await variation.product.updateAggregatedData();


        res.status(200).json({
            success: true,
            message: req.t('productVariation.deleted'),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Télécharger des images pour une variation de produit
 * @route   POST /api/product-variations/:id/images
 * @access  Private (Seller owner of product or Admin)
 */
exports.uploadProductVariationImages = async (req, res, next) => {
    try {
        const { id } = req.params;
        const variation = await ProductVariation.findById(id).populate('product', 'shop');

        if (!variation) {
            return next(new AppError('productVariation.notFound', 404));
        }

        if (variation.product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        if (!req.files || req.files.length === 0) {
            return next(new AppError('errors.noFileUploaded', 400));
        }

        const uploadedImageUrls = req.files.map(file => file.path);
        variation.images.push(...uploadedImageUrls);
        await variation.save();

        res.status(200).json({
            success: true,
            message: req.t('seller.variationImagesUploaded', uploadedImageUrls.length),
            data: variation.images,
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
 * @desc    Supprimer une image spécifique d'une variation de produit
 * @route   DELETE /api/product-variations/:id/images/:imageId
 * @access  Private (Seller owner of product or Admin)
 */
exports.removeProductVariationImage = async (req, res, next) => {
    try {
        const { id, imageId } = req.params;
        const variation = await ProductVariation.findById(id).populate('product', 'shop');

        if (!variation) {
            return next(new AppError('productVariation.notFound', 404));
        }

        if (variation.product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        const imageUrlToRemove = variation.images.find(url => url.includes(imageId));
        if (!imageUrlToRemove) {
            return next(new AppError('errors.imageNotFound', 404));
        }

        const publicId = imageUrlToRemove.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`5kl_ecommerce/${publicId}`);

        variation.images = variation.images.filter(url => url !== imageUrlToRemove);
        await variation.save();

        res.status(200).json({
            success: true,
            message: req.t('seller.variationImageRemoved'),
            data: variation.images,
        });
    } catch (error) {
        next(error);
    }
};

// --- Gestion des Mouvements de Stock ---

/**
 * @desc    Enregistrer un mouvement de stock pour une variation
 * @route   POST /api/product-variations/:id/stock-movements
 * @access  Private (Seller owner of product or Admin)
 */
exports.recordStockMovement = async (req, res, next) => {
    try {
        const { id } = req.params; // ID de la variation
        const { error, value } = stockMovementSchema.validate(req.body, { abortEarly: false });
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { type, quantity, reason, reference } = value;

        let variation = await ProductVariation.findById(id).populate('product', 'shop');
        if (!variation) {
            return next(new AppError('productVariation.notFound', 404));
        }

        if (variation.product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        let newStock = variation.stock;
        if (type === 'in') {
            newStock += quantity;
        } else if (type === 'out' || type === 'adjustment') {
            if (newStock < quantity && type === 'out') {
                return next(new AppError('productVariation.validation.notEnoughStockForMovement', 400, [variation.product.name, variation.attributes.map(a => a.value).join(', '), variation.stock, quantity]));
            }
            newStock -= quantity;
        } else {
            return next(new AppError('admin.stockMovementTypeInvalid', 400));
        }

        variation.stock = newStock;
        await variation.save();

        const stockMovement = await StockMovement.create({
            variation: variation._id,
            product: variation.product._id,
            type,
            quantity,
            reason,
            reference,
            movedBy: req.user.id,
            currentStock: newStock
        });

        await variation.product.updateAggregatedData();


        res.status(201).json({
            success: true,
            message: req.t('admin.stockMovementRecorded'),
            data: stockMovement
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir l'historique des mouvements de stock pour une variation
 * @route   GET /api/product-variations/:id/stock-movements?page=1&limit=10
 * @access  Private (Seller owner of product or Admin)
 */
exports.getStockMovements = async (req, res, next) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const variation = await ProductVariation.findById(id).populate('product', 'shop');
        if (!variation) {
            return next(new AppError('productVariation.notFound', 404));
        }

        if (variation.product.shop.toString() !== req.user.shop.toString() && !req.user.roles.includes('admin')) {
            return next(new AppError('product.forbidden', 403));
        }

        const movements = await StockMovement.find({ variation: id })
            .populate('movedBy', 'username email')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);

        const totalMovements = await StockMovement.countDocuments({ variation: id });

        res.status(200).json({
            success: true,
            count: movements.length,
            total: totalMovements,
            page,
            pages: Math.ceil(totalMovements / limit),
            data: movements
        });
    } catch (error) {
        next(error);
    }
};

// --- Gestion des Catégories et Marques (inchangé) ---

/**
 * @desc    Créer une nouvelle catégorie
 * @route   POST /api/products/categories
 * @access  Private (Admin only)
 */
exports.createCategory = async (req, res, next) => {
    try {
        const { error, value } = categorySchema.validate(req.body, { abortEarly: false });
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { name, parentCategory, description, image } = value;

        const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingCategory) {
            return next(new AppError('category.alreadyExists', 400));
        }

        if (parentCategory) {
            const parent = await Category.findById(parentCategory);
            if (!parent) {
                return next(new AppError('category.notFound', 400));
            }
        }

        const category = await Category.create({
            name,
            parentCategory,
            description,
            image,
        });

        res.status(201).json({
            success: true,
            message: req.t('category.created'),
            data: category,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les catégories (avec sous-catégories)
 * @route   GET /api/products/categories
 * @access  Public
 */
exports.getCategories = async (req, res, next) => {
    try {
        const categories = await Category.find().populate('parentCategory', 'name slug');
        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories,
        });
    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Créer une nouvelle marque
 * @route   POST /api/products/brands
 * @access  Private (Admin only)
 */
exports.createBrand = async (req, res, next) => {
    try {
        const { error, value } = brandSchema.validate(req.body, { abortEarly: false });
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { name, description, logo } = value;

        const existingBrand = await Brand.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingBrand) {
            return next(new AppError('brand.alreadyExists', 400));
        }

        const brand = await Brand.create({
            name,
            description,
            logo,
        });

        res.status(201).json({
            success: true,
            message: req.t('brand.created'),
            data: brand,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtenir toutes les marques
 * @route   GET /api/products/brands
 * @access  Public
 */
exports.getBrands = async (req, res, next) => {
    try {
        const brands = await Brand.find();
        res.status(200).json({
            success: true,
            count: brands.length,
            data: brands,
        });
    } catch (error) {
        next(error);
    }
};