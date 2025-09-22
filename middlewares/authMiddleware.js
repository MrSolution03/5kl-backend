// 5kl-backend/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const { promisify } = require('util'); // AJOUTÉ : pour utiliser jwt.verify avec async/await
const User = require('../models/User');
const AppError = require('../utils/appError');
const { translate } = require('../utils/i18n');

exports.protect = async (req, res, next) => {
    let token;

    // 1) Vérifier si le token est dans le cookie (méthode préférée)
    if (req.cookies && req.cookies.jwt) {
        token = req.cookies.jwt;
    }
    // Optionnel : Si vous voulez toujours supporter l'en-tête Authorization (ex: pour Postman),
    // décommentez le bloc suivant, mais le cookie est plus sécurisé.
    // if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    //     token = req.headers.authorization.split(' ')[1];
    // }

    if (!token) {
        return next(new AppError('auth.notLoggedIn', 401)); // Nouvelle clé
    }

    try {
        // 2) Vérifier la validité du token
        const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

        // 3) Vérifier si l'utilisateur existe toujours
        const currentUser = await User.findById(decoded.id).select('-password');
        if (!currentUser) {
            return next(new AppError('auth.userNotFoundForToken', 401)); // Nouvelle clé
        }

        // 4) Vérifier si l'utilisateur est banni
        if (currentUser.isBanned) {
            const bannedReason = currentUser.bannedReason || translate(req.lang, 'auth.defaultBanReason');
            return next(new AppError('auth.userBannedAccessDenied', 403, [bannedReason])); // Nouvelle clé
        }

        // 5) Attribuer l'utilisateur à la requête pour un accès ultérieur
        req.user = currentUser;
        next();
    } catch (error) {
        console.error('JWT verification failed:', error); // Log l'erreur pour le débogage
        // Utilise AppError pour les échecs de token
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('auth.invalidToken', 401));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('auth.tokenExpired', 401));
        }
        next(error); // Passe les autres erreurs
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {
        const userRoles = req.user.roles || [];
        const hasPermission = roles.some(role => userRoles.includes(role));

        if (!hasPermission) {
            return next(new AppError('errors.forbidden', 403));
        }
        next();
    };
};