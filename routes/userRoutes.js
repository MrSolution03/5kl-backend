// 5kl-backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Toutes les routes ici nécessitent que l'utilisateur soit connecté (acheteur, vendeur, admin)
router.use(protect);

// Routes pour le profil de l'utilisateur connecté
router.route('/me')
    .get(userController.getMe)
    .put(userController.updateUser)
    .delete(userController.deleteUser); // L'utilisateur peut supprimer son propre compte

// Route pour changer le mot de passe
router.put('/me/changepassword', userController.changePassword);

// Routes pour les adresses de l'utilisateur
router.route('/me/addresses')
    .post(userController.addAddress);
router.route('/me/addresses/:addressId')
    .put(userController.updateUserAddress)
    .delete(userController.removeAddress);

// Route pour le tableau de bord de l'acheteur
router.get('/me/dashboard', authorize('buyer'), userController.getBuyerDashboard);

// Routes pour archiver l'historique
router.delete('/me/history/orders', authorize('buyer'), userController.archiveOrderHistory);
router.delete('/me/history/offers', authorize('buyer'), userController.archiveOfferHistory);

// Routes pour les recommandations
router.get('/me/recommendations', authorize('buyer'), userController.getRecommendedProducts);

// AJOUTÉ : Routes pour les messages envoyés par l'admin à l'utilisateur
router.get('/me/messages', userController.getAdminMessages);


// Routes accessibles uniquement par l'administrateur (inchangées)
router.route('/')
    .get(authorize('admin'), userController.getUsers);

router.route('/:id')
    .get(authorize('admin'), userController.getUserById)
    .put(authorize('admin'), userController.updateUserRole)
    .delete(authorize('admin'), userController.deleteUserById);

module.exports = router;