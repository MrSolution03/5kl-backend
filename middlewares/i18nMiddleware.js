// 5kl-backend/middlewares/i18nMiddleware.js
const { translate, DEFAULT_LOCALE, SUPPORTED_LOCALES } = require('../utils/i18n');

const i18nMiddleware = (req, res, next) => {
    let lang = DEFAULT_LOCALE;

    // 1. Priorité aux paramètres de requête (ex: ?lang=en)
    if (req.query.lang && SUPPORTED_LOCALES.includes(req.query.lang)) {
        lang = req.query.lang;
    }
    // 2. Ensuite, vérifier l'en-tête Accept-Language
    else if (req.headers['accept-language']) {
        const acceptLanguages = req.headers['accept-language']
            .split(',')
            .map(l => l.split(';')[0].trim().toLowerCase());

        for (const al of acceptLanguages) {
            if (SUPPORTED_LOCALES.includes(al)) {
                lang = al;
                break;
            }
            // Gérer les sous-langues (ex: fr-FR -> fr)
            const baseLang = al.split('-')[0];
            if (SUPPORTED_LOCALES.includes(baseLang)) {
                lang = baseLang;
                break;
            }
        }
    }
    // Si aucune langue supportée n'est trouvée, la langue par défaut (fr) est utilisée.

    req.lang = lang;
    req.t = (key, ...args) => translate(req.lang, key, args);

    next();
};

module.exports = i18nMiddleware;