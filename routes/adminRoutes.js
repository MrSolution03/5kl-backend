// 5kl-backend/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const productController = require('../controllers/productController'); // Pour la gestion des catégories/marques
const { protect, authorize } = require('../middlewares/authMiddleware');
const { upload } = require('../utils/cloudinary'); // Pour les uploads de logos/images si l'admin les gère

// Toutes les routes ici sont protégées et nécessitent le rôle 'admin'
router.use(protect, authorize('admin'));

// Gestion des utilisateurs
router.route('/users')
    .get(adminController.getAllUsers); // Obtenir tous les utilisateurs

router.route('/users/:id')
    .get(adminController.getUserDetails)
    .put(adminController.updateUserRole) // Mettre à jour le rôle d'un utilisateur (appel à adminController.updateUserRole)
    .delete(adminController.deleteUser); // Supprimer un utilisateur (appel à adminController.deleteUser)


// Gestion des boutiques
router.route('/shops')
    .get(adminController.getAllShops); // Obtenir toutes les boutiques (y compris celles non approuvées)

router.route('/shops/:id/approve')
    .put(adminController.approveShop); // Approuver une boutique

router.route('/shops/:id/status') // CHANGEMENT : Renommé de /deactivate à /status pour plus de généricité
    .put(adminController.updateShopStatus); // Désactiver/activer une boutique


// Gestion des commandes
router.route('/orders')
    .get(adminController.getAllOrders); // Obtenir toutes les commandes

router.route('/orders/pending')
    .get(adminController.getPendingOrders); // Obtenir les commandes en attente d'approbation

router.route('/orders/:id/accept')
    .put(adminController.acceptOrder); // Accepter une commande

router.route('/orders/:id/reject')
    .put(adminController.rejectOrder); // Rejeter une commande

router.route('/orders/:id/status')
    .put(adminController.updateOrderStatus); // Mettre à jour le statut de livraison

// Gestion des offres de prix
router.route('/offers')
    .get(adminController.getAllOffers); // Obtenir toutes les offres

router.route('/offers/pending')
    .get(adminController.getPendingOffers); // Obtenir les offres en attente

router.route('/offers/:id/accept')
    .put(adminController.acceptOffer); // Accepter une offre

router.route('/offers/:id/reject')
    .put(adminController.rejectOffer); // Rejeter une offre

router.route('/offers/:id/message')
    .post(adminController.addAdminMessageToOffer); // L'admin peut ajouter un message ou une contre-offre

// Gestion des catégories (update/delete - create est dans productController et déléguée à l'admin pour l'accès)
router.route('/categories')
    .post(productController.createCategory); // Créer une nouvelle catégorie (utilisé via adminController dans sa route admin)
router.route('/categories/:id')
    .put(adminController.updateCategory) // Mettre à jour une catégorie
    .delete(adminController.deleteCategory); // Supprimer une catégorie

// Gestion des marques (update/delete - create est dans productController et déléguée à l'admin pour l'accès)
router.route('/brands')
    .post(productController.createBrand); // Créer une nouvelle marque (utilisé via adminController dans sa route admin)
router.route('/brands/:id')
    .put(adminController.updateBrand) // Mettre à jour une marque
    .delete(adminController.deleteBrand); // Supprimer une marque

module.exports = router;