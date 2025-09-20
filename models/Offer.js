// 5kl-backend/models/Offer.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: { // Qui envoie le message: buyer ou admin
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: { // Le contenu du message
        type: String,
        required: true,
        trim: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    isOffer: { // Indique si ce message contient une proposition de prix
        type: Boolean,
        default: false
    },
    price: { // Le prix proposé dans ce message (si isOffer est true)
        type: Number,
        min: 0
    }
}, {
    _id: false // Pas besoin d'un _id pour chaque message
});

const offerSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    initialProposedPrice: { // Le premier prix proposé par l'acheteur
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'retracted', 'expired'],
        default: 'pending'
    },
    adminNotes: { // Raison de rejet par l'admin
        type: String
    },
    acceptedPrice: { // Le prix final si l'offre est acceptée
        type: Number,
        min: 0
    },
    messages: [messageSchema], // Historique de la discussion
    lastActivity: { // Pour trier les offres actives par date
        type: Date,
        default: Date.now
    },
    // Référence à la commande si l'offre a mené à un achat
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    }
}, {
    timestamps: true
});

// Middleware pour mettre à jour lastActivity à chaque nouveau message ou changement de statut
offerSchema.pre('save', function (next) {
    if (this.isModified('messages') || this.isModified('status')) {
        this.lastActivity = Date.now();
    }
    next();
});

module.exports = mongoose.model('Offer', offerSchema);