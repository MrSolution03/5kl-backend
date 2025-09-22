// 5kl-backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passport = require('passport');
const { protect } = require('../middlewares/authMiddleware');

// Routes d'enregistrement et de connexion traditionnelles
router.post('/register', authController.register);
router.post('/login', authController.login);

// Routes d'authentification Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login` }), // Modifier la redirection en cas d'échec
    authController.googleCallback
);

// Routes d'authentification Facebook
router.get('/facebook', passport.authenticate('facebook', { scope: ['email', 'public_profile'] }));
router.get('/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login` }), // Modifier la redirection en cas d'échec
    authController.facebookCallback
);

// Routes de réinitialisation de mot de passe
router.post('/forgotpassword', authController.forgotPassword);
router.put('/resetpassword/:resettoken', authController.resetPassword);

// AJOUTÉ : Route de déconnexion
router.get('/logout', authController.logout);


module.exports = router;