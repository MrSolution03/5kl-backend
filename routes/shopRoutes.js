// 5kl-backend/routes/shopRoutes.js
const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { upload } = require('../utils/cloudinary'); // Pour les uploads de logos

// Routes publiques (tous peuvent voir les boutiques)
router.route('/')
    .get(shopController.getShops); // Obtenir toutes les boutiques

router.route('/:id')
    .get(shopController.getShopById); // Obtenir une boutique par ID

router.route('/:id/products')
    .get(shopController.getShopProducts); // Obtenir les produits d'une boutique

// Routes nécessitant une authentification et une autorisation
// Créer une boutique (un vendeur peut créer sa boutique, ou un admin)
router.post('/', protect, authorize('seller', 'admin'), shopController.createShop);

// Mettre à jour ou supprimer une boutique (uniquement le propriétaire de la boutique ou l'admin)
router.route('/:id')
    .put(protect, authorize('seller', 'admin'), shopController.updateShop)
    .delete(protect, authorize('admin'), shopController.deleteShop); // Seul l'admin peut supprimer une boutique entièrement

// Upload du logo de la boutique
router.put('/:id/logo', protect, authorize('seller', 'admin'), upload.single('logo'), shopController.uploadShopLogo);

module.exports = router;