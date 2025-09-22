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
    // Le flag 'secure' ne doit être true que si le client et le serveur communiquent en HTTPS.
    // Si votre frontend est en HTTP (e.g., http://localhost:5173) et votre backend est en HTTPS (e.g., Render),
    // le navigateur refusera le cookie "secure".
    // Pour le développement local, nous allons le désactiver, puis le réactiver en production.
    secure: process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https',
    // Note: req.protocol peut être 'http' même derrière un proxy HTTPS comme Render si pas configuré.
    // 'x-forwarded-proto' est un en-tête plus fiable pour vérifier le protocole original en production.
    // Mais pour le test local avec frontend HTTP -> backend HTTPS, il faut souvent un 'secure: false'.
    // Tentons une approche plus directe pour le débogage :
    // Pour que ça marche en développement avec localhost (HTTP) et Render (HTTPS), secure doit être false.
    // Pour la production sur Render (HTTPS), il DOIT être true.
    // La meilleure approche est souvent de laisser la production le gérer correctement, et de s'adapter en local.
    // Dans votre cas, comme vous êtes en local (HTTP) vers Render (HTTPS):

    // AJUSTEMENT CLÉ ICI POUR LE DÉBOGAGE LOCAL
    // Pour que le cookie soit accepté par http://localhost, il ne peut pas être "secure".
    // Mais pour production sur Render (HTTPS), il devrait être "true".
    // La solution la plus simple pour le dev est de le forcer à false si ce n'est pas la production.
    secure: process.env.NODE_ENV === 'production' ? true : false,

    sameSite: 'Lax', // 'Lax' est un bon équilibre pour la sécurité CSRF sans trop gêner les requêtes inter-sites légitimes.
    // Pour des cas complexes (OAuth avec certains providers), 'None' peut être nécessaire avec 'secure: true'.
    // domain: '.yourdomain.com', // Décommenter si vous avez des sous-domaines et que c'est nécessaire
  };

  // NOUVEAUX LOGS DÉTAILLÉS POUR LE DÉBOGAGE DU COOKIE
  console.log('--- createSendToken logs ---');
  console.log('User ID for token:', user._id);
  console.log('User roles for token:', user.roles);
  console.log('Token generated:', token ? token.substring(0, 10) + '...' : 'NONE');
  console.log('Cookie options being set:', cookieOptions);
  console.log('req.protocol:', req.protocol);
  console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
  console.log('Calculated secure flag for cookie:', cookieOptions.secure);


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
      profilePicture: user.profilePicture,
      shop: user.shop
    },
  });
  console.log('Response JSON sent by createSendToken.'); // Log après envoi de la réponse
  console.log('--- createSendToken END ---');
};

module.exports = {
    signToken,
    createSendToken
};