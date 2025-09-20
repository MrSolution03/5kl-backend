// 5kl-backend/utils/currencyConverter.js
const CurrencyRate = require('../models/CurrencyRate');
const AppError = require('./appError'); // Pour les erreurs de taux non trouvés

const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'FC';
const BASE_CURRENCY_FOR_PRODUCTS = process.env.BASE_CURRENCY_FOR_PRODUCTS || 'FC'; // Monnaie de base pour le stockage des prix des produits

/**
 * Récupère le taux de conversion entre deux devises.
 * @param {String} fromCurrency - La devise source.
 * @param {String} toCurrency - La devise cible.
 * @returns {Promise<Number>} Le taux (combien de toCurrency pour 1 fromCurrency).
 */
const getConversionRate = async (fromCurrency, toCurrency) => {
    if (fromCurrency === toCurrency) {
        return 1;
    }

    const rateDoc = await CurrencyRate.findOne({ baseCurrency: fromCurrency, targetCurrency: toCurrency });
    if (rateDoc) {
        return rateDoc.rate;
    }

    // Tenter l'inverse
    const inverseRateDoc = await CurrencyRate.findOne({ baseCurrency: toCurrency, targetCurrency: fromCurrency });
    if (inverseRateDoc) {
        return 1 / inverseRateDoc.rate;
    }

    // Fallback pour le démarrage si les taux ne sont pas en DB et sont les devises par défaut
    if (fromCurrency === 'USD' && toCurrency === 'FC' && process.env.REFERENCE_EXCHANGE_RATE_USD_TO_FC) {
        console.warn("Currency rate (USD to FC) not found in DB, using default from .env.");
        return parseFloat(process.env.REFERENCE_EXCHANGE_RATE_USD_TO_FC);
    }
    if (fromCurrency === 'FC' && toCurrency === 'USD' && process.env.REFERENCE_EXCHANGE_RATE_USD_TO_FC) {
        console.warn("Currency rate (FC to USD) not found in DB, using default from .env.");
        return 1 / parseFloat(process.env.REFERENCE_EXCHANGE_RATE_USD_TO_FC);
    }

    throw new AppError('currency.exchangeRateNotConfigured', 500, [`${fromCurrency} à ${toCurrency}`]);
};

/**
 * Convertit un montant d'une devise source vers une devise cible.
 * @param {Number} amount - Le montant à convertir.
 * @param {String} fromCurrency - La devise source (ex: 'FC', 'USD').
 * @param {String} toCurrency - La devise cible (ex: 'FC', 'USD').
 * @returns {Promise<Number>} Le montant converti.
 */
const convertCurrency = async (amount, fromCurrency, toCurrency) => {
    if (fromCurrency === toCurrency) {
        return amount;
    }
    const rate = await getConversionRate(fromCurrency, toCurrency);
    return amount * rate;
};

/**
 * Formate un prix pour l'affichage avec le symbole de la devise.
 * @param {Number} amount - Le montant.
 * @param {String} currency - La devise (ex: 'FC', 'USD').
 * @param {String} locale - La locale pour le formatage (ex: 'fr', 'en').
 * @returns {String} Le prix formaté.
 */
const formatPrice = (amount, currency, locale = DEFAULT_CURRENCY) => {
    let options = {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    };

    try {
        const formatter = new Intl.NumberFormat(locale, options);
        let formatted = formatter.format(amount);
        // Ajustement pour FC si Intl.NumberFormat le place avant
        if (currency === 'FC' && formatted.includes('FC') && formatted.indexOf('FC') === 0) {
            formatted = formatted.replace('FC', '').trim();
            return `${formatted} FC`;
        }
        return formatted;
    } catch (e) {
        console.error("Error formatting currency:", e);
        return `${amount.toFixed(2)} ${currency}`; // Fallback
    }
};

module.exports = {
    getConversionRate,
    convertCurrency,
    formatPrice,
    BASE_CURRENCY_FOR_PRODUCTS,
    DEFAULT_CURRENCY
};