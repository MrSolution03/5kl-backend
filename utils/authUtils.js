// 5kl-backend/utils/authUtils.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Importe le modèle User (si nécessaire pour createSendToken)

// Fonction pour signer le JWT
const signToken = (id, roles) => {
  return jwt.sign({ id, roles }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Fonction pour envoyer le token JWT dans un cookie HTTP-only et la réponse JSON
const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id, user.roles);

  // Calculer la date d'expiration du cookie
  const cookieExpiresInDays = parseInt(process.env.JWT_COOKIE_EXPIRES_IN, 10);
  const cookieOptions = {
    expires: new Date(Date.now() + cookieExpiresInDays * 24 * 60 * 60 * 1000),
    httpOnly: true, // Empêche l'accès via JavaScript, TRÈS IMPORTANT pour la sécurité
    secure: req.protocol === 'https' || process.env.NODE_ENV === 'production', // true seulement en HTTPS ou production
    sameSite: 'Lax', // Ou 'Strict' pour plus de sécurité (peut impacter certaines redirections OAuth)
    // domain: '.yourdomain.com', // Décommenter si vous avez des sous-domaines et que c'est nécessaire
  };

  res.cookie('jwt', token, cookieOptions); // Définit le cookie JWT

  // Supprime le mot de passe de l'objet utilisateur avant d'envoyer la réponse
  user.password = undefined; // IMPORTANT pour ne pas l'exposer

  res.status(statusCode).json({
    success: true,
    message: req.t('auth.loginSuccess'), // Utilise req.t pour la traduction
    user: { // Renvoyer uniquement les informations utilisateur non sensibles
      id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      isEmailVerified: user.isEmailVerified,
      isBanned: user.isBanned,
      profilePicture: user.profilePicture, // AJOUTÉ
      shop: user.shop // Si c'est un vendeur
    },
  });
};

module.exports = {
    signToken,
    createSendToken
};