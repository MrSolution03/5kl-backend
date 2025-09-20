// 5kl-backend/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { upload } = require('../utils/cloudinary'); // Pour les uploads d'images de produits

// Routes publiques
router.route('/')
    .get(productController.getProducts); // Obtenir tous les produits (avec filtres de recherche)

router.route('/:id')
    .get(productController.getProductById); // Obtenir un produit par ID

// Routes de gestion des catégories (accessibles par tous pour la lecture, mais création/modification par Admin)
router.route('/categories')
    .get(productController.getCategories)
    .post(protect, authorize('admin'), productController.createCategory); // Seul l'admin peut créer une catégorie
// Pas de PUT/DELETE pour les catégories ici, plutôt dans adminRoutes pour une gestion centralisée

// Routes de gestion des marques (accessibles par tous pour la lecture, mais création/modification par Admin)
router.route('/brands')
    .get(productController.getBrands)
    .post(protect, authorize('admin'), productController.createBrand); // Seul l'admin peut créer une marque
// Pas de PUT/DELETE pour les marques ici, plutôt dans adminRoutes

// Routes nécessitant une authentification et une autorisation pour les opérations sur les produits
// Créer un produit (seuls les vendeurs peuvent)
router.post('/', protect, authorize('seller'), productController.createProduct);

// Mettre à jour ou supprimer un produit (le vendeur propriétaire ou l'admin)
router.route('/:id')
    .put(protect, authorize('seller', 'admin'), productController.updateProduct)
    .delete(protect, authorize('seller', 'admin'), productController.deleteProduct);

// Upload d'images pour un produit (plusieurs images)
router.post('/:id/images', protect, authorize('seller', 'admin'), upload.array('images', 5), productController.uploadProductImages); // Max 5 images
// Supprimer une image spécifique d'un produit
router.delete('/:id/images/:imageId', protect, authorize('seller', 'admin'), productController.removeProductImage);


module.exports = router;