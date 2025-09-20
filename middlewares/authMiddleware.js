// 5kl-backend/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Le modèle User doit être défini

exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password'); // Attache l'utilisateur à la requête (sans le mot de passe)
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, user not found' });
        }
        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {
        // Supposons qu'un utilisateur ait un tableau de rôles et nous vérifions si l'un de ses rôles est autorisé
        const userRoles = req.user.roles || [];
        const hasPermission = roles.some(role => userRoles.includes(role));

        if (!hasPermission) {
            return res.status(403).json({
                message: `User with role(s) ${userRoles.join(', ')} is not authorized to access this route.`
            });
        }
        next();
    };
};