// 5kl-backend/routes/offerRoutes.js
const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Créer une nouvelle offre pour un produit
router.post('/', protect, authorize('buyer'), offerController.createOffer);

// Obtenir les offres de l'utilisateur connecté
router.get('/', protect, authorize('buyer'), offerController.getOffers);

// Gérer une offre spécifique
router.route('/:id')
    .get(protect, authorize('buyer'), offerController.getOfferById) // Obtenir les détails d'une offre et sa discussion
    .post(protect, authorize('buyer'), offerController.addMessageToOffer) // Ajouter un message ou une contre-offre
    .put(protect, authorize('buyer'), offerController.retractOffer); // L'acheteur retire son offre

// Endpoint spécial pour accepter une offre et l'ajouter au panier (lien envoyé par l'admin)
// Ce lien pourrait contenir un token à usage unique pour des raisons de sécurité, ou être protégé par l'authentification de l'utilisateur
router.post('/:id/accept-to-cart', protect, authorize('buyer'), offerController.acceptOfferToCart);

module.exports = router;