// 5kl-backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect, authorize('buyer')); // Toutes les routes de commande sont pour les acheteurs connectés

router.route('/')
    .post(orderController.createOrder) // Créer une commande (checkout)
    .get(orderController.getOrders); // Obtenir toutes les commandes de l'utilisateur connecté

router.route('/:id')
    .get(orderController.getOrderById) // Obtenir une commande spécifique de l'utilisateur
    .put(orderController.cancelOrder); // L'utilisateur peut annuler sa propre commande (sous certaines conditions)

module.exports = router;