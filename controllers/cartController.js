// 5kl-backend/controllers/cartController.js
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const AppError = require('../utils/appError');
const Joi = require('joi');

// --- Schemas de Validation Joi ---

const addItemToCartSchema = Joi.object({
    productId: Joi.string().hex().length(24).required(),
    quantity: Joi.number().integer().min(1).required(),
}).options({ stripUnknown: true }); // Supprime les champs inconnus

const updateCartItemQuantitySchema = Joi.object({
    quantity: Joi.number().integer().min(0).required(), // min 0 pour permettre la suppression
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
            .populate('items.product', 'name price images stock shop'); // Peupler les détails du produit

        if (!cart) {
            return res.status(200).json({
                success: true,
                message: req.t('cart.notFound'), // Retourne un message informatif plutôt qu'une 404
                data: { user: req.user.id, items: [], totalPrice: 0 } // Retourne un panier vide
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
 * @desc    Ajouter un article au panier (ou mettre à jour la quantité si déjà présent)
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

        const { productId, quantity } = value;

        const product = await Product.findById(productId);
        if (!product || !product.isAvailable) {
            return next(new AppError('cart.productNotFound', 404));
        }

        // Vérifier le stock disponible
        if (product.stock < quantity) {
            return next(new AppError('cart.notEnoughStock', 400, [product.name, product.stock, quantity]));
        }

        let cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            // Créer un nouveau panier si l'utilisateur n'en a pas
            cart = await Cart.create({
                user: req.user.id,
                items: [{ product: productId, quantity, priceAtAddToCart: product.price }],
                totalPrice: product.price * quantity
            });
            // Pas besoin de populate car on vient de le créer et la réponse le retournera tel quel
            return res.status(201).json({
                success: true,
                message: req.t('cart.addedToCart'),
                data: cart,
            });
        }

        // Vérifier si le produit est déjà dans le panier
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

        if (itemIndex > -1) {
            // Le produit existe déjà, mettre à jour la quantité
            const currentQuantity = cart.items[itemIndex].quantity;
            const newQuantity = currentQuantity + quantity;

            if (product.stock < newQuantity) {
                return next(new AppError('cart.notEnoughStock', 400, [product.name, product.stock, newQuantity]));
            }

            cart.items[itemIndex].quantity = newQuantity;
            cart.items[itemIndex].priceAtAddToCart = product.price; // Mettre à jour le prix au cas où il aurait changé
            await cart.save(); // Le middleware pre('save') mettra à jour le totalPrice

            await cart.populate('items.product', 'name price images stock shop'); // Peupler pour la réponse
            return res.status(200).json({
                success: true,
                message: req.t('cart.quantityUpdated'), // Ou 'cart.alreadyInCart'
                data: cart,
            });
        } else {
            // Ajouter un nouvel article au panier
            cart.items.push({ product: productId, quantity, priceAtAddToCart: product.price });
            await cart.save(); // Le middleware pre('save') mettra à jour le totalPrice

            await cart.populate('items.product', 'name price images stock shop'); // Peupler pour la réponse
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
 * @desc    Mettre à jour la quantité d'un article spécifique dans le panier
 * @route   PUT /api/cart/:productId
 * @access  Private (Buyer)
 */
exports.updateCartItemQuantity = async (req, res, next) => {
    try {
        const { productId } = req.params;
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

        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
        if (itemIndex === -1) {
            return next(new AppError('cart.itemNotFound', 404));
        }

        if (quantity === 0) {
            // Si la quantité est 0, supprimer l'article du panier
            cart.items.splice(itemIndex, 1);
            await cart.save();
            await cart.populate('items.product', 'name price images stock shop');
            return res.status(200).json({
                success: true,
                message: req.t('cart.removedFromCart'),
                data: cart,
            });
        }

        // Vérifier le stock si la quantité est augmentée
        const product = await Product.findById(productId);
        if (!product || !product.isAvailable) {
            return next(new AppError('cart.productNotFound', 404));
        }
        if (product.stock < quantity) {
            return next(new AppError('cart.notEnoughStock', 400, [product.name, product.stock, quantity]));
        }

        cart.items[itemIndex].quantity = quantity;
        cart.items[itemIndex].priceAtAddToCart = product.price; // Mettre à jour le prix au cas où il aurait changé
        await cart.save(); // Le middleware pre('save') mettra à jour le totalPrice

        await cart.populate('items.product', 'name price images stock shop'); // Peupler pour la réponse
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
 * @desc    Supprimer un article spécifique du panier
 * @route   DELETE /api/cart/:productId
 * @access  Private (Buyer)
 */
exports.removeItemFromCart = async (req, res, next) => {
    try {
        const { productId } = req.params;

        let cart = await Cart.findOne({ user: req.user.id });
        if (!cart) {
            return next(new AppError('cart.notFound', 404));
        }

        const initialItemCount = cart.items.length;
        cart.items = cart.items.filter(item => item.product.toString() !== productId);

        if (cart.items.length === initialItemCount) {
            return next(new AppError('cart.itemNotFound', 404));
        }

        await cart.save(); // Le middleware pre('save') mettra à jour le totalPrice

        await cart.populate('items.product', 'name price images stock shop'); // Peupler pour la réponse
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
            // Si le panier n'existe pas, il n'y a rien à vider, mais c'est un succès du point de vue de l'action
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