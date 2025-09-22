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
const AdminMessage = require('./models/AdminMessage');
const ProductVariation = require('./models/ProductVariation');
const StockMovement = require('./models/StockMovement');

dotenv.config();

// --- CORS CONFIG ---
const allowedOrigins = [
  'http://localhost:5173',      // local dev
  process.env.FRONTEND_URL      // deployed frontend (set in .env)
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like Postman, curl)
    if (!origin) return callback(null, true);

    // Always allow localhost in dev
    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
};

// --- EXPRESS APP INIT ---
const app = express();

// DB connection
require('./config/db');

// Ensure default CurrencyRate doc
app.use(async (req, res, next) => {
  try {
    let currencyRate = await CurrencyRate.findOne();
    if (!currencyRate) {
      await CurrencyRate.create({ USD_TO_FC_RATE: 2700, lastUpdatedBy: null });
      console.log('Default CurrencyRate document created.');
    }
    next();
  } catch (error) {
    console.error('Failed to ensure CurrencyRate document exists:', error);
    next(error);
  }
});

// --- MIDDLEWARES ---
// Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security
app.use(mongoSanitize());
app.use(cors(corsOptions));        // CORS first
app.options('*', cors(corsOptions)); // Allow preflight
app.use(helmet());

// i18n
app.use(i18nMiddleware);

// Passport
app.use(passport.initialize());
require('./config/passport')(passport);

// --- ROUTES ---
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

// Base route
app.get('/', (req, res) => {
  res.send(req.t('common.success') + ' 5KL E-commerce API is running!');
});

// 404 handler
app.use((req, res, next) => {
  next(new AppError('errors.notFound', 404, [req.originalUrl]));
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error('Global Error Handler caught:', err);

  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = error.status || 'error';

  // Joi validation
  if (err.isJoi) {
    const joiMessages = error.details.map(d =>
      req.t(`joi.${d.type}`, d.context) || d.message
    );
    error.message = req.t('errors.validationError', joiMessages.join('. '));
    error.statusCode = 400;
    error.status = 'fail';
  }

  // Token & DB errors (etc) ...
  // [keep your existing mapping here]

  res.status(error.statusCode).json({
    success: false,
    status: error.status,
    message: error.message || req.t('errors.internalServerError'),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// --- START SERVER ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
