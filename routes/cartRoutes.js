// 5kl-backend/routes/cartRoutes.js
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Toutes les opérations sur le panier nécessitent une authentification (rôle 'buyer' implicite car le panier est personnel)
router.route('/')
    .get(protect, authorize('buyer'), cartController.getCart) // Obtenir le panier de l'utilisateur connecté
    .post(protect, authorize('buyer'), cartController.addItemToCart) // Ajouter un article au panier
    .delete(protect, authorize('buyer'), cartController.clearCart); // Vider tout le panier

router.route('/:productId')
    .put(protect, authorize('buyer'), cartController.updateCartItemQuantity) // Mettre à jour la quantité d'un article
    .delete(protect, authorize('buyer'), cartController.removeItemFromCart); // Supprimer un article spécifique du panier

module.exports = router;