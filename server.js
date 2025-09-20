// 5kl-backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const passport = require('passport');
const AppError = require('./utils/appError');
const i18nMiddleware = require('./middlewares/i18nMiddleware');
const CurrencyRate = require('./models/CurrencyRate');
const AdminMessage = require('./models/AdminMessage'); // AJOUTÉ : Importation du modèle AdminMessage

// Charger les variables d'environnement
dotenv.config();

// AJOUTÉ : Configuration CORS pour la production
const allowedOrigins = [
    'http://localhost:3000', // Pour le développement local de votre frontend
    process.env.FRONTEND_URL, // L'URL de votre frontend déployé
    // Ajoutez d'autres origines si nécessaire (ex: votre domaine personnalisé)
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    optionsSuccessStatus: 200
};

// Initialiser l'application Express
const app = express();

// Configuration de la base de données
require('./config/db');

// Middleware pour initialiser le taux de change si non existant (au démarrage)
app.use(async (req, res, next) => {
    try {
        let currencyRate = await CurrencyRate.findOne();
        if (!currencyRate) {
            currencyRate = await CurrencyRate.create({ USD_TO_FC_RATE: 2700, lastUpdatedBy: null });
            console.log('Default CurrencyRate document created.');
        }
        next();
    } catch (error) {
        console.error('Failed to ensure CurrencyRate document exists:', error);
        next(error);
    }
});


// Middlewares de sécurité et utilitaires
app.use(i18nMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(helmet());
app.use(mongoSanitize());

// Initialisation de Passport
app.use(passport.initialize());
require('./config/passport')(passport);

// Routes de l'API
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const shopRoutes = require('./routes/shopRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const offerRoutes = require('./routes/offerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const sellerRoutes = require('./routes/sellerRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);

// Route de base
app.get('/', (req, res) => {
    res.send(req.t('common.success') + ' 5KL E-commerce API is running!');
});

// Middleware pour gérer les routes non trouvées (404)
app.use((req, res, next) => {
    next(new AppError('errors.notFound', 404, [req.originalUrl]));
});


// Gestionnaire d'erreurs global (DOIT ÊTRE LE DERNIER middleware app.use())
app.use((err, req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
        console.error(err);
    }

    let error = { ...err };
    error.message = err.message;
    error.statusCode = err.statusCode || 500;
    error.status = error.status || 'error';

    if (err.isJoi) {
        const joiMessages = error.details.map(detail => {
            return req.t(`joi.${detail.type}`, detail.context) || detail.message;
        });
        error.message = req.t('errors.validationError', joiMessages.join('. '));
        error.statusCode = 400;
        error.status = 'fail';
    }

    let translatedMessage = error.message;

    if (err instanceof AppError) {
        translatedMessage = req.t(err.messageKey, ...(err.translationArgs || []));
    } else if (err.name === 'CastError') {
        translatedMessage = req.t('errors.resourceNotFound', err.value);
        error.statusCode = 404;
        error.status = 'fail';
    } else if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const value = err.keyValue[field];
        translatedMessage = req.t('errors.duplicateField', value, field);
        error.statusCode = 400;
        error.status = 'fail';
    } else if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message).join('. ');
        translatedMessage = req.t('errors.validationError', messages);
        error.statusCode = 400;
        error.status = 'fail';
    } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        translatedMessage = req.t('errors.invalidToken');
        error.statusCode = 401;
        error.status = 'fail';
    } else if (error.message === 'Not authorized, no token') {
        translatedMessage = req.t('errors.missingToken');
        error.statusCode = 401;
        error.status = 'fail';
    } else if (error.message === 'Not authorized, token failed') {
        translatedMessage = req.t('errors.invalidToken');
        error.statusCode = 401;
        error.status = 'fail';
    } else if (error.message && error.message.includes('not authorized to access this route')) {
        translatedMessage = req.t('errors.forbidden');
        error.statusCode = 403;
        error.status = 'fail';
    }
    else if (error.message && error.message.includes('file type')) {
        translatedMessage = req.t('errors.invalidFileType');
        error.statusCode = 400;
        error.status = 'fail';
    } else if (error.message && error.message.includes('File too large')) {
        translatedMessage = req.t('errors.fileUploadFailed', '5MB');
        error.statusCode = 400;
        error.status = 'fail';
    }
    else if (!translatedMessage || translatedMessage.startsWith('[errors.')) {
        translatedMessage = req.t('errors.internalServerError');
        error.statusCode = 500;
        error.status = 'error';
    }

    res.status(error.statusCode).json({
        success: false,
        status: error.status,
        message: translatedMessage,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});