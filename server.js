// 5kl-backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const passport = require('passport');
const AppError = require('./utils/appError');
const i18nMiddleware = require('./middlewares/i18nMiddleware'); // Importation du middleware i18n

// Charger les variables d'environnement
dotenv.config();

// Initialiser l'application Express
const app = express();

// Configuration de la base de données
require('./config/db');

// Middlewares de sécurité et utilitaires
app.use(i18nMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());

// ✅ FIX express-mongo-sanitize for Express 5+
app.use((req, res, next) => {
  if (req.body) {
    req.body = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  }
  if (req.params) {
    req.params = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  }
  // ⚠️ Ne pas modifier req.query (getter en Express 5)
  next();
});

// Initialisation de Passport
app.use(passport.initialize());
require('./config/passport')(passport);

// Routes de l'API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/shops', require('./routes/shopRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/offers', require('./routes/offerRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/seller', require('./routes/sellerRoutes'));

// Route de base
app.get('/', (req, res) => {
  res.send(req.t('common.success') + ' 5KL E-commerce API is running!');
});

// Middleware pour gérer les routes non trouvées (404)
app.use((req, res, next) => {
  next(new AppError('errors.notFound', 404, [req.originalUrl]));
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = error.status || 'error';

  let translatedMessage = error.message;

  if (err instanceof AppError && err.messageKey) {
    translatedMessage = req.t(err.messageKey, ...err.translationArgs);
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
    const messages = Object.values(err.errors)
      .map(val => val.message)
      .join('. ');
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
  } else if (!translatedMessage || translatedMessage.startsWith('[errors.')) {
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
