// 5kl-backend/utils/i18n.js
const fs = require('fs');
const path = require('path');

const locales = {};
const DEFAULT_LOCALE = 'fr'; // Français par défaut

// Fonction pour charger toutes les locales
const loadLocales = () => {
    const localeFiles = fs.readdirSync(path.join(__dirname, '../locales'));
    for (const file of localeFiles) {
        if (file.endsWith('.json')) {
            const localeName = file.split('.')[0];
            locales[localeName] = require(path.join(__dirname, '../locales', file));
        }
    }
    console.log('Locales loaded:', Object.keys(locales));
};

// Charge les locales au démarrage du module
loadLocales();

/**
 * Fonction de traduction.
 * @param {string} locale - La locale désirée (ex: 'fr', 'en', 'sw').
 * @param {string} key - La clé du message (ex: 'auth.loginSuccess').
 * @param {Array<string|number>} [args] - Arguments pour l'interpolation (ex: 'Cannot find {0}').
 * @returns {string} Le message traduit.
 */
const translate = (locale, key, args = []) => {
    const messages = locales[locale] || locales[DEFAULT_LOCALE];
    const keys = key.split('.');
    let value = messages;

    for (const k of keys) {
        if (value && typeof value === 'object' && value.hasOwnProperty(k)) {
            value = value[k];
        } else {
            // Clé non trouvée, retourner la clé elle-même ou un message d'erreur générique
            console.warn(`Translation key '${key}' not found for locale '${locale}'`);
            return `[${key}]`; // Ou un message par défaut comme `Translation missing for ${key}`
        }
    }

    if (typeof value === 'string') {
        // Remplacer les placeholders (ex: {0}, {1}) par les arguments
        return args.reduce((acc, arg, index) => acc.replace(`{${index}}`, arg), value);
    }

    return `[${key}]`; // Si la valeur n'est pas une chaîne
};

module.exports = {
    translate,
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES: Object.keys(locales)
};