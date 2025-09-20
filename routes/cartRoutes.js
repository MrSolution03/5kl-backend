// 5kl-backend/routes/cartRoutes.js
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect, authorize('buyer')); // Toutes les routes du panier sont pour les acheteurs connectés

router.route('/')
    .get(cartController.getCart) // Obtenir le panier de l'utilisateur connecté
    .post(cartController.addItemToCart) // Ajouter un article (variation) au panier
    .delete(cartController.clearCart); // Vider tout le panier

router.route('/:productVariationId') // MODIFIÉ : ID de la variation de produit
    .put(cartController.updateCartItemQuantity) // Mettre à jour la quantité d'un article (variation)
    .delete(cartController.removeItemFromCart); // Supprimer un article (variation) spécifique du panier

module.exports = router;