// 5kl-backend/routes/sellerRoutes.js
const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/sellerController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { upload } = require('../utils/cloudinary'); // Pour les uploads d'images

// Toutes les routes ici sont protégées et nécessitent le rôle 'seller'
router.use(protect, authorize('seller'));

// Dashboard vendeur
router.get('/dashboard', sellerController.getSellerDashboard);

// Gestion de la boutique du vendeur
router.route('/shop')
    .post(sellerController.createShop) // Créer sa boutique (une seule par vendeur)
    .get(sellerController.getOwnShop) // Obtenir les détails de sa boutique
    .put(sellerController.updateOwnShop); // Mettre à jour les détails de sa boutique

router.put('/shop/logo', upload.single('logo'), sellerController.uploadShopLogo); // Upload du logo de la boutique

// Gestion des produits du vendeur
router.route('/products')
    .post(sellerController.createProduct) // Créer un nouveau produit
    .get(sellerController.getShopProducts); // Obtenir tous les produits de sa boutique

router.route('/products/:id')
    .put(sellerController.updateProduct) // Mettre à jour un de ses produits
    .delete(sellerController.deleteProduct); // Supprimer un de ses produits

router.post('/products/:id/images', upload.array('images', 5), sellerController.uploadProductImages); // Upload d'images pour un de ses produits
router.delete('/products/:id/images/:imageId', sellerController.removeProductImage); // Supprimer une image de son produit

// Commandes et offres liées à la boutique du vendeur
router.get('/orders', sellerController.getShopOrders); // Obtenir les commandes qui concernent sa boutique
router.get('/offers', sellerController.getShopOffers); // Obtenir les offres de prix pour ses produits

module.exports = router;