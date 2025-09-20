// 5kl-backend/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const productController = require('../controllers/productController'); // Pour la création de catégories/marques publiques par l'admin
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect, authorize('admin')); // Toutes les routes ici sont protégées et nécessitent le rôle 'admin'

// Gestion des utilisateurs
router.route('/users')
    .get(adminController.getAllUsers);

router.route('/users/:id')
    .get(adminController.getUserDetails)
    .put(adminController.updateUserRole)
    .delete(adminController.deleteUser);

router.put('/users/:id/ban', adminController.banUser);
router.put('/users/:id/unban', adminController.unbanUser);


// Gestion des boutiques
router.route('/shops')
    .get(adminController.getAllShops);

router.route('/shops/:id/approve')
    .put(adminController.approveShop);

router.route('/shops/:id/status')
    .put(adminController.updateShopStatus);


// Gestion des commandes
router.route('/orders')
    .get(adminController.getAllOrders);

router.route('/orders/pending')
    .get(adminController.getPendingOrders);

router.route('/orders/:id/accept')
    .put(adminController.acceptOrder);

router.route('/orders/:id/reject')
    .put(adminController.rejectOrder);

router.route('/orders/:id/status')
    .put(adminController.updateOrderStatus);

router.route('/orders/:id/mark-as-paid')
    .put(adminController.markOrderAsPaid);


// Gestion des offres de prix
router.route('/offers')
    .get(adminController.getAllOffers);

router.route('/offers/pending')
    .get(adminController.getPendingOffers);

router.route('/offers/:id/accept')
    .put(adminController.acceptOffer);

router.route('/offers/:id/reject')
    .put(adminController.rejectOffer);

router.route('/offers/:id/message')
    .post(adminController.addAdminMessageToOffer);


// Gestion des catégories (L'admin utilise aussi les fonctions du productController pour la création)
router.route('/categories')
    .post(productController.createCategory); // Admin crée une catégorie
router.route('/categories/:id')
    .put(adminController.updateCategory) // Admin met à jour une catégorie
    .delete(adminController.deleteCategory); // Admin supprime une catégorie

// Gestion des marques (L'admin utilise aussi les fonctions du productController pour la création)
router.route('/brands')
    .post(productController.createBrand); // Admin crée une marque
router.route('/brands/:id')
    .put(adminController.updateBrand) // Admin met à jour une marque
    .delete(adminController.deleteBrand); // Admin supprime une marque

// Gestion des Taux de Change
router.route('/currency-rate')
    .get(adminController.getCurrencyRate)
    .put(adminController.updateCurrencyRate);

// Gestion des Messages Admin
router.route('/messages')
    .post(adminController.sendMessage)
    .get(adminController.getSentMessages);

// AJOUTÉ : Gestion des Mouvements de Stock (accessible par l'admin pour n'importe quelle variation)
router.route('/product-variations/:id/stock-movements')
    .post(adminController.recordStockMovement) // Enregistrer un mouvement de stock
    .get(adminController.getStockMovements); // Obtenir les mouvements de stock

module.exports = router;