// 5kl-backend/models/CurrencyRate.js
const mongoose = require('mongoose');

const currencyRateSchema = new mongoose.Schema({
    // Le taux de conversion USD vers FC
    // Exemple : 1 USD = 2700 FC
    USD_TO_FC_RATE: {
        type: Number,
        required: true,
        min: 1, // Le taux doit être positif
        default: 2700 // Taux par défaut, à ajuster
    },
    // Qui a mis à jour le taux en dernier
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// Middleware pour s'assurer qu'il n'y a qu'un seul document dans cette collection
currencyRateSchema.pre('save', async function(next) {
    if (this.isNew) { // Si c'est un nouveau document
        const existingRate = await mongoose.model('CurrencyRate').findOne();
        if (existingRate && existingRate._id.toString() !== this._id.toString()) {
            return next(new Error('Only one currency rate document can exist. Use update instead of create.'));
        }
    }
    next();
});

module.exports = mongoose.model('CurrencyRate', currencyRateSchema);