// 5kl-backend/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: { // L'utilisateur qui doit recevoir la notification
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sender: { // Qui est à l'origine de la notification (Admin ou système)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // Peut être null pour les notifications système (ex: stock faible)
    },
    type: { // Type de notification (ex: 'order_status', 'offer_update', 'admin_message', 'low_stock')
        type: String,
        required: true,
        enum: ['order_status', 'offer_update', 'admin_message', 'low_stock', 'new_order_request', 'new_offer_request', 'system']
    },
    title: { // Titre court de la notification (traduit au moment de la création)
        type: String,
        required: true,
        trim: true
    },
    message: { // Message complet de la notification (traduit au moment de la création)
        type: String,
        required: true
    },
    isRead: { // Si l'utilisateur a lu la notification
        type: Boolean,
        default: false
    },
    relatedEntity: { // Référence à l'entité concernée (commande, offre, produit, etc.)
        id: { type: mongoose.Schema.Types.ObjectId, refPath: 'relatedEntityType' },
        relatedEntityType: { type: String, enum: ['Order', 'Offer', 'Product', 'ProductVariation', 'Shop', 'User'] }
    },
    sentAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Ajoute createdAt et updatedAt
});

module.exports = mongoose.model('Notification', notificationSchema);