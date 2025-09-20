// 5kl-backend/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/appError'); // AJOUTÉ : pour utiliser AppError
const { translate } = require('../utils/i18n'); // AJOUTÉ : pour traduire les messages de ban

exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('errors.missingToken', 401)); // Utilise AppError
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            return next(new AppError('errors.notAuthorized', 401)); // Utilisateur introuvable
        }

        // AJOUTÉ : Vérifier si l'utilisateur est banni
        if (req.user.isBanned) {
            const bannedReason = req.user.bannedReason || translate(req.lang, 'auth.defaultBanReason'); // Traduit la raison
            return next(new AppError('auth.userBanned', 403, [bannedReason]));
        }

        next();
    } catch (error) {
        console.error(error); // Log l'erreur pour le débogage
        // Utilise AppError pour les échecs de token
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('errors.invalidToken', 401));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('errors.tokenExpired', 401));
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