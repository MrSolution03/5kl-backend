// 5kl-backend/controllers/productController.js
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const User = require('../models/User');
const CurrencyRate = require('../models/CurrencyRate'); // AJOUTÉ : Pour récupérer le taux de change
const AppError = require('../utils/appError');
const Joi = require('joi');
const { upload, cloudinary } = require('../utils/cloudinary');
const { SUPPORTED_CURRENCIES } = require('../utils/i18n'); // AJOUTÉ pour la validation de devise


// --- Schemas de Validation Joi (inchangés) ---

const productSchema = Joi.object({
    name: Joi.string().trim().min(3).max(255).required(),
    description: Joi.string().trim().min(10).max(2000).required(),
    price: Joi.number().min(0.01).required(),
    category: Joi.string().hex().length(24).required(),
    subCategory: Joi.string().hex().length(24).optional().allow(null, ''),
    brand: Joi.string().hex().length(24).optional().allow(null, ''),
    stock: Joi.number().integer().min(0).required(),
    sku: Joi.string().trim().alphanum().min(3).max(50).optional().allow(null, ''),
    isAvailable: Joi.boolean().optional().default(true),
    attributes: Joi.array().items(Joi.object({
        key: Joi.string().trim().required(),
        value: Joi.string().trim().required()
    })).optional().default([]),
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
            // Créer un taux par défaut si inexistant
            const defaultRate = 2700;
            await CurrencyRate.create({ USD_TO_FC_RATE: defaultRate, lastUpdatedBy: req.user ? req.user.id : null });
            return priceFC / defaultRate;
        }
        return priceFC / currencyRate.USD_TO_FC_RATE;
    }
    // Devise non supportée, retourner l'erreur ou la devise par défaut
    throw new AppError('order.invalidCurrency', 400); // Réutiliser une clé d'erreur existante ou en créer une nouvelle
}


// --- Fonctions des Contrôleurs ---

/**
 * @desc    Créer un nouveau produit
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

        const { name, description, price, category, subCategory, brand, stock, sku, isAvailable, attributes } = value;

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

        if (sku) {
            const existingProduct = await Product.findOne({ sku });
            if (existingProduct) {
                return next(new AppError('product.productAlreadyExists', 400));
            }
        }

        const product = await Product.create({
            name,
            description,
            price, // Le prix est toujours stocké en FC par défaut (devise de base)
            category,
            subCategory,
            brand,
            stock,
            sku,
            isAvailable,
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

        // Validation de la devise cible
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

        // Les filtres minPrice/maxPrice doivent toujours être dans la devise de base (FC) ou nécessiter une conversion
        // Pour simplifier, nous supposons que minPrice/maxPrice sont toujours fournis dans la devise de base FC.
        // Si le frontend fournit minPrice/maxPrice dans une autre devise, il doit le convertir avant d'appeler l'API.
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        if (isAvailable !== undefined) {
            query.isAvailable = isAvailable === 'true';
        }

        const attributeFilters = {};
        for (const key in filterAttributes) {
            if (!['page', 'limit', 'sortBy', 'name', 'category', 'subCategory', 'brand', 'shop', 'minPrice', 'maxPrice', 'isAvailable', 'targetCurrency'].includes(key)) {
                query[`attributes.key`] = key;
                query[`attributes.value`] = filterAttributes[key];
            }
        }

        if (Object.keys(attributeFilters).length > 0) {
            query = { ...query, ...attributeFilters };
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

        // Appliquer la conversion de devise à chaque produit
        const convertedProducts = await Promise.all(products.map(async (product) => {
            const convertedPrice = await convertPrice(product.price, targetCurrency, req);
            return {
                ...product.toObject(),
                price: parseFloat(convertedPrice.toFixed(2)), // Arrondir à 2 décimales
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
 * @desc    Obtenir un produit par ID (avec conversion de devise)
 * @route   GET /api/products/:id?targetCurrency=USD
 * @access  Public
 */
exports.getProductById = async (req, res, next) => {
    try {
        const { targetCurrency = 'FC' } = req.query;

        // Validation de la devise cible
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

        // Mettre à jour les produits récemment consultés de l'utilisateur (si l'utilisateur est connecté)
        if (req.user && req.user.id) {
            const user = await User.findById(req.user.id);
            if (user) {
                user.lastViewedProducts = user.lastViewedProducts.filter(
                    item => item.product.toString() !== product._id.toString()
                );
                user.lastViewedProducts.push({ product: product._id, timestamp: Date.now() });
                user.lastViewedProducts = user.lastViewedProducts.slice(-10);
                await user.save({ validateBeforeSave: false });
            }
        }

        // Appliquer la conversion de devise
        const convertedPrice = await convertPrice(product.price, targetCurrency, req);

        const convertedProduct = {
            ...product.toObject(),
            price: parseFloat(convertedPrice.toFixed(2)),
            currency: targetCurrency
        };

        res.status(200).json({
            success: true,
            data: convertedProduct,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour un produit
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

        if (value.sku && value.sku !== product.sku) {
            const existingProduct = await Product.findOne({ sku: value.sku });
            if (existingProduct && existingProduct._id.toString() !== product._id.toString()) {
                return next(new AppError('product.productAlreadyExists', 400));
            }
        }

        product = await Product.findByIdAndUpdate(req.params.id, value, {
            new: true,
            runValidators: true,
        }).populate('category subCategory brand shop');

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
 * @desc    Supprimer un produit
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
 * @desc    Télécharger des images pour un produit
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
 * @desc    Supprimer une image spécifique d'un produit
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