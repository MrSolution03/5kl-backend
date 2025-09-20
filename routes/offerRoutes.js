// 5kl-backend/routes/offerRoutes.js
const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect, authorize('buyer')); // Toutes les routes d'offre sont pour les acheteurs connectés

router.route('/')
    .post(offerController.createOffer) // Créer une nouvelle offre pour une variation de produit
    .get(offerController.getOffers); // Obtenir les offres de l'utilisateur connecté

router.route('/:id')
    .get(offerController.getOfferById) // Obtenir les détails d'une offre et sa discussion
    .post(offerController.addMessageToOffer) // Ajouter un message ou une contre-offre
    .put(offerController.retractOffer); // L'acheteur retire son offre

router.post('/:id/accept-to-cart', offerController.acceptOfferToCart); // Accepter une offre et l'ajouter au panier (lien envoyé par l'admin)

module.exports = router;