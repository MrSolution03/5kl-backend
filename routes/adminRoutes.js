// 5kl-backend/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Toutes les routes ici sont protégées et nécessitent le rôle 'admin'
router.use(protect, authorize('admin'));

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


// Gestion des catégories
router.route('/categories')
    .post(productController.createCategory);
router.route('/categories/:id')
    .put(adminController.updateCategory)
    .delete(adminController.deleteCategory);

// Gestion des marques
router.route('/brands')
    .post(productController.createBrand);
router.route('/brands/:id')
    .put(adminController.updateBrand)
    .delete(adminController.deleteBrand);

// Gestion des Taux de Change
router.route('/currency-rate')
    .get(adminController.getCurrencyRate)
    .put(adminController.updateCurrencyRate);

// AJOUTÉ : Routes de gestion des messages par l'admin
router.route('/messages')
    .post(adminController.sendMessage) // Envoyer un message
    .get(adminController.getSentMessages); // Voir les messages envoyés par cet admin


module.exports = router;