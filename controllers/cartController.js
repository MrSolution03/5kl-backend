// 5kl-backend/controllers/cartController.js
const Cart = require('../models/Cart');
const Product = require('../models/Product'); // Pour le produit parent, si nécessaire
const ProductVariation = require('../models/ProductVariation'); // AJOUTÉ
const AppError = require('../utils/appError');
const Joi = require('joi');

// --- Schemas de Validation Joi ---

const addItemToCartSchema = Joi.object({
    productVariationId: Joi.string().hex().length(24).required(), // MODIFIÉ
    quantity: Joi.number().integer().min(1).required(),
}).options({ stripUnknown: true });

const updateCartItemQuantitySchema = Joi.object({
    quantity: Joi.number().integer().min(0).required(),
}).options({ stripUnknown: true });

// --- Fonctions des Contrôleurs ---

/**
 * @desc    Obtenir le panier de l'utilisateur connecté
 * @route   GET /api/cart
 * @access  Private (Buyer)
 */
exports.getCart = async (req, res, next) => {
    try {
        const cart = await Cart.findOne({ user: req.user.id })
            .populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' } // Peupler la variation, et son produit parent
            });

        if (!cart) {
            return res.status(200).json({
                success: true,
                message: req.t('cart.notFound'),
                data: { user: req.user.id, items: [], totalPrice: 0 }
            });
        }

        res.status(200).json({
            success: true,
            data: cart,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Ajouter un article (variation) au panier (ou mettre à jour la quantité si déjà présent)
 * @route   POST /api/cart
 * @access  Private (Buyer)
 */
exports.addItemToCart = async (req, res, next) => {
    try {
        const { error, value } = addItemToCartSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { productVariationId, quantity } = value;

        const variation = await ProductVariation.findById(productVariationId).populate('product', 'name'); // Peupler le produit parent pour le nom
        if (!variation || !variation.isAvailable) {
            return next(new AppError('cart.productVariationNotFound', 404));
        }

        // Vérifier le stock disponible pour la variation
        if (variation.stock < quantity) {
            return next(new AppError('cart.notEnoughStock', 400, [variation.product.name, variation.attributes.map(a => a.value).join(', '), variation.stock, quantity]));
        }

        let cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            // Créer un nouveau panier si l'utilisateur n'en a pas
            cart = await Cart.create({
                user: req.user.id,
                items: [{ productVariation: productVariationId, quantity, priceAtAddToCart: variation.price }],
                totalPrice: variation.price * quantity
            });
            await cart.populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' }
            });
            return res.status(201).json({
                success: true,
                message: req.t('cart.addedToCart'),
                data: cart,
            });
        }

        // Vérifier si la variation est déjà dans le panier
        const itemIndex = cart.items.findIndex(item => item.productVariation.toString() === productVariationId);

        if (itemIndex > -1) {
            // La variation existe déjà, mettre à jour la quantité
            const currentQuantity = cart.items[itemIndex].quantity;
            const newQuantity = currentQuantity + quantity;

            if (variation.stock < newQuantity) {
                return next(new AppError('cart.notEnoughStock', 400, [variation.product.name, variation.attributes.map(a => a.value).join(', '), variation.stock, newQuantity]));
            }

            cart.items[itemIndex].quantity = newQuantity;
            cart.items[itemIndex].priceAtAddToCart = variation.price; // Mettre à jour le prix au cas où il aurait changé
            await cart.save();

            await cart.populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' }
            });
            return res.status(200).json({
                success: true,
                message: req.t('cart.quantityUpdated'),
                data: cart,
            });
        } else {
            // Ajouter un nouvel article (variation) au panier
            cart.items.push({ productVariation: productVariationId, quantity, priceAtAddToCart: variation.price });
            await cart.save();

            await cart.populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' }
            });
            res.status(200).json({
                success: true,
                message: req.t('cart.addedToCart'),
                data: cart,
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mettre à jour la quantité d'un article spécifique (variation) dans le panier
 * @route   PUT /api/cart/:productVariationId
 * @access  Private (Buyer)
 */
exports.updateCartItemQuantity = async (req, res, next) => {
    try {
        const { productVariationId } = req.params;
        const { error, value } = updateCartItemQuantitySchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { quantity } = value;

        let cart = await Cart.findOne({ user: req.user.id });
        if (!cart) {
            return next(new AppError('cart.notFound', 404));
        }

        const itemIndex = cart.items.findIndex(item => item.productVariation.toString() === productVariationId);
        if (itemIndex === -1) {
            return next(new AppError('cart.itemNotFound', 404));
        }

        if (quantity === 0) {
            // Si la quantité est 0, supprimer l'article du panier
            cart.items.splice(itemIndex, 1);
            await cart.save();
            await cart.populate({
                path: 'items.productVariation',
                populate: { path: 'product', select: 'name images' }
            });
            return res.status(200).json({
                success: true,
                message: req.t('cart.removedFromCart'),
                data: cart,
            });
        }

        // Vérifier le stock si la quantité est augmentée
        const variation = await ProductVariation.findById(productVariationId).populate('product', 'name');
        if (!variation || !variation.isAvailable) {
            return next(new AppError('cart.productVariationNotFound', 404));
        }
        if (variation.stock < quantity) {
            return next(new AppError('cart.notEnoughStock', 400, [variation.product.name, variation.attributes.map(a => a.value).join(', '), variation.stock, quantity]));
        }

        cart.items[itemIndex].quantity = quantity;
        cart.items[itemIndex].priceAtAddToCart = variation.price; // Mettre à jour le prix au cas où il aurait changé
        await cart.save();

        await cart.populate({
            path: 'items.productVariation',
            populate: { path: 'product', select: 'name images' }
        });
        res.status(200).json({
            success: true,
            message: req.t('cart.quantityUpdated'),
            data: cart,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Supprimer un article spécifique (variation) du panier
 * @route   DELETE /api/cart/:productVariationId
 * @access  Private (Buyer)
 */
exports.removeItemFromCart = async (req, res, next) => {
    try {
        const { productVariationId } = req.params;

        let cart = await Cart.findOne({ user: req.user.id });
        if (!cart) {
            return next(new AppError('cart.notFound', 404));
        }

        const initialItemCount = cart.items.length;
        cart.items = cart.items.filter(item => item.productVariation.toString() !== productVariationId);

        if (cart.items.length === initialItemCount) {
            return next(new AppError('cart.itemNotFound', 404));
        }

        await cart.save();

        await cart.populate({
            path: 'items.productVariation',
            populate: { path: 'product', select: 'name images' }
        });
        res.status(200).json({
            success: true,
            message: req.t('cart.removedFromCart'),
            data: cart,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Vider tout le panier de l'utilisateur
 * @route   DELETE /api/cart
 * @access  Private (Buyer)
 */
exports.clearCart = async (req, res, next) => {
    try {
        const cart = await Cart.findOneAndDelete({ user: req.user.id });

        if (!cart) {
            return res.status(200).json({
                success: true,
                message: req.t('cart.cleared'),
                data: { user: req.user.id, items: [], totalPrice: 0 }
            });
        }

        res.status(200).json({
            success: true,
            message: req.t('cart.cleared'),
            data: { user: req.user.id, items: [], totalPrice: 0 }
        });
    } catch (error) {
        next(error);
    }
};