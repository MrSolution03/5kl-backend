// 5kl-backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passport = require('passport');
const { protect } = require('../middlewares/authMiddleware');

// Routes d'enregistrement et de connexion traditionnelles
router.post('/register', authController.register); // MODIFIÉ : Retiré '/auth'
router.post('/login', authController.login);       // MODIFIÉ : Retiré '/auth'

// Routes d'authentification Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] })); // MODIFIÉ : Retiré '/auth'
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    authController.googleCallback
);

// Routes d'authentification Facebook
router.get('/facebook', passport.authenticate('facebook', { scope: ['email', 'public_profile'] })); // MODIFIÉ : Retiré '/auth'
router.get('/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: '/login' }),
    authController.facebookCallback
);

// Route pour obtenir le profil de l'utilisateur connecté (si vous l'avez ici, sinon il est dans userRoutes)
// router.get('/me', protect, authController.getMe); 

// Routes de réinitialisation de mot de passe
router.post('/forgotpassword', authController.forgotPassword); // MODIFIÉ : Retiré '/auth'
router.put('/resetpassword/:resettoken', authController.resetPassword); // MODIFIÉ : Retiré '/auth'


module.exports = router;