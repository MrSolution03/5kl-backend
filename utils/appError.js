// 5kl-backend/utils/appError.js
class AppError extends Error {
    constructor(messageKey, statusCode, translationArgs = []) {
        super(messageKey); // Le message initial est la clé de traduction
        this.messageKey = messageKey; // Stocke la clé de traduction séparément
        this.translationArgs = translationArgs; // Arguments pour la traduction
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;