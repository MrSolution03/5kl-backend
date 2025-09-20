// 5kl-backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { upload } = require('../utils/cloudinary');

// --- Routes Publiques (Produits, Catégories, Marques) ---
router.route('/')
    .get(productController.getProducts); // Obtenir tous les produits (avec filtres de recherche)

router.route('/:id')
    .get(productController.getProductById); // Obtenir un produit par ID (avec ses variations)

router.route('/categories')
    .get(productController.getCategories); // Obtenir toutes les catégories

router.route('/brands')
    .get(productController.getBrands); // Obtenir toutes les marques

// --- Routes Publiques pour les Variations ---
router.route('/:productId/variations')
    .get(productController.getProductVariations); // Obtenir toutes les variations d'un produit

router.route('/product-variations/:id')
    .get(productController.getProductVariationById); // Obtenir une variation spécifique par ID


// --- Routes Protégées (Opérations sur les Produits et leurs Variations) ---
router.use(protect); // Toutes les routes ci-dessous nécessitent une authentification

// Opérations sur le Produit Parent (par vendeur ou admin)
router.route('/')
    .post(authorize('seller'), productController.createProduct); // Créer un produit parent

router.route('/:id')
    .put(authorize('seller', 'admin'), productController.updateProduct) // Mettre à jour un produit parent
    .delete(authorize('seller', 'admin'), productController.deleteProduct); // Supprimer un produit parent

router.post('/:id/images', authorize('seller', 'admin'), upload.array('images', 5), productController.uploadProductImages);
router.delete('/:id/images/:imageId', authorize('seller', 'admin'), productController.removeProductImage);


// Opérations sur les Variations de Produit (par vendeur ou admin)
router.route('/:productId/variations')
    .post(authorize('seller', 'admin'), productController.createProductVariation); // Créer une variation pour un produit

router.route('/product-variations/:id')
    .put(authorize('seller', 'admin'), productController.updateProductVariation) // Mettre à jour une variation
    .delete(authorize('seller', 'admin'), productController.deleteProductVariation); // Supprimer une variation

router.post('/product-variations/:id/images', authorize('seller', 'admin'), upload.array('images', 5), productController.uploadProductVariationImages);
router.delete('/product-variations/:id/images/:imageId', authorize('seller', 'admin'), productController.removeProductVariationImage);

// Opérations sur les Mouvements de Stock (par vendeur ou admin)
router.route('/product-variations/:id/stock-movements')
    .post(authorize('seller', 'admin'), productController.recordStockMovement) // Enregistrer un mouvement de stock
    .get(authorize('seller', 'admin'), productController.getStockMovements); // Obtenir les mouvements de stock


// Routes de gestion des catégories et marques par l'admin (déjà dans adminRoutes, mais aussi dans productController pour la logique)
// Ces routes sont exposées directement via adminRoutes.js pour une meilleure encapsulation admin.

module.exports = router;