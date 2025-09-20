// 5kl-backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Créer une commande (checkout)
router.post('/', protect, authorize('buyer'), orderController.createOrder);

// Obtenir toutes les commandes de l'utilisateur connecté
router.get('/', protect, authorize('buyer'), orderController.getOrders);

// Obtenir une commande spécifique de l'utilisateur
router.route('/:id')
    .get(protect, authorize('buyer'), orderController.getOrderById)
    .put(protect, authorize('buyer'), orderController.cancelOrder); // L'utilisateur peut annuler sa propre commande (sous certaines conditions)

module.exports = router;