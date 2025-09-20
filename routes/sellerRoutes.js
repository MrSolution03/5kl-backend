// 5kl-backend/routes/sellerRoutes.js
const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/sellerController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { upload } = require('../utils/cloudinary');

router.use(protect, authorize('seller')); // Toutes les routes ici sont protégées et nécessitent le rôle 'seller'

// Dashboard vendeur
router.get('/dashboard', sellerController.getSellerDashboard);

// Gestion de la boutique du vendeur
router.route('/shop')
    .post(sellerController.createShop) // Créer sa boutique (une seule par vendeur)
    .get(sellerController.getOwnShop) // Obtenir les détails de sa boutique
    .put(sellerController.updateOwnShop); // Mettre à jour les détails de sa boutique

router.put('/shop/logo', upload.single('logo'), sellerController.uploadShopLogo); // Upload du logo de la boutique

// --- Opérations sur les Produits Parents du Vendeur ---
router.route('/products')
    .post(sellerController.createProduct) // Créer un nouveau produit parent
    .get(sellerController.getShopProducts); // Obtenir tous les produits parents de sa boutique

router.route('/products/:id')
    .put(sellerController.updateProduct) // Mettre à jour un de ses produits parents
    .delete(sellerController.deleteProduct); // Supprimer un de ses produits parents

router.post('/products/:id/images', upload.array('images', 5), sellerController.uploadProductImages); // Upload d'images générales pour un de ses produits
router.delete('/products/:id/images/:imageId', sellerController.removeProductImage); // Supprimer une image générale de son produit


// --- AJOUTÉ : Opérations sur les Variations de Produits du Vendeur ---
router.route('/products/:productId/variations')
    .post(sellerController.createProductVariation) // Créer une variation pour un produit de sa boutique
    .get(sellerController.getProductVariations); // Obtenir toutes les variations d'un produit de sa boutique

router.route('/product-variations/:id') // Note: route pour une variation spécifique (pas liée au productId)
    .get(sellerController.getProductVariationById) // Obtenir une variation spécifique par ID
    .put(sellerController.updateProductVariation) // Mettre à jour une variation de produit
    .delete(sellerController.deleteProductVariation); // Supprimer une variation de produit

router.post('/product-variations/:id/images', upload.array('images', 5), sellerController.uploadProductVariationImages); // Upload d'images spécifiques à une variation
router.delete('/product-variations/:id/images/:imageId', sellerController.removeProductVariationImage); // Supprimer une image spécifique d'une variation

// --- AJOUTÉ : Opérations sur les Mouvements de Stock des Variations du Vendeur ---
router.route('/product-variations/:id/stock-movements')
    .post(sellerController.recordStockMovement) // Enregistrer un mouvement de stock pour une variation
    .get(sellerController.getStockMovements); // Obtenir les mouvements de stock pour une variation


// Commandes et offres liées à la boutique du vendeur
router.get('/orders', sellerController.getShopOrders); // Obtenir les commandes qui concernent sa boutique
router.get('/offers', sellerController.getShopOffers); // Obtenir les offres de prix pour ses produits

module.exports = router;