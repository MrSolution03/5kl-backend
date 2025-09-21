// 5kl-backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passport = require('passport');

// Route d'enregistrement et de connexion traditionnelles
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Routes d'authentification Google
// Déclenche le flux d'authentification Google
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// Callback après l'authentification Google
router.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    authController.googleCallback
);

// Routes d'authentification Facebook
// Déclenche le flux d'authentification Facebook
router.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email', 'public_profile'] }));
// Callback après l'authentification Facebook
router.get('/auth/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: '/login' }),
    authController.facebookCallback
);

// La route /me a été déplacée vers userRoutes.js (/api/users/me)

module.exports = router;