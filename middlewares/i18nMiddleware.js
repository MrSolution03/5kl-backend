// 5kl-backend/middlewares/i18nMiddleware.js
const { translate, DEFAULT_LOCALE, SUPPORTED_LOCALES } = require('../utils/i18n');
const { DEFAULT_CURRENCY } = require('../utils/currencyConverter'); // AJOUTÉ

const SUPPORTED_CURRENCIES = ['FC', 'USD'];

const i18nMiddleware = (req, res, next) => {
    let lang = DEFAULT_LOCALE;
    let currency = DEFAULT_CURRENCY; // Devise par défaut

    // --- Détection de la langue (inchangé) ---
    if (req.query.lang && SUPPORTED_LOCALES.includes(req.query.lang)) {
        lang = req.query.lang;
    } else if (req.headers['accept-language']) {
        const acceptLanguages = req.headers['accept-language']
            .split(',')
            .map(l => l.split(';')[0].trim().toLowerCase());
        for (const al of acceptLanguages) {
            if (SUPPORTED_LOCALES.includes(al)) {
                lang = al;
                break;
            }
            const baseLang = al.split('-')[0];
            if (SUPPORTED_LOCALES.includes(baseLang)) {
                lang = baseLang;
                break;
            }
        }
    }

    // --- Détection de la devise (NOUVEAU) ---
    // 1. Priorité aux paramètres de requête (ex: ?currency=USD)
    if (req.query.currency && SUPPORTED_CURRENCIES.includes(req.query.currency.toUpperCase())) {
        currency = req.query.currency.toUpperCase();
    }
    // 2. Ensuite, vérifier l'en-tête Accept-Currency (custom header)
    else if (req.headers['accept-currency'] && SUPPORTED_CURRENCIES.includes(req.headers['accept-currency'].toUpperCase())) {
        currency = req.headers['accept-currency'].toUpperCase();
    }

    req.lang = lang;
    req.t = (key, ...args) => translate(req.lang, key, args);
    req.currency = currency; // Attache la devise détectée à la requête

    next();
};

module.exports = i18nMiddleware;