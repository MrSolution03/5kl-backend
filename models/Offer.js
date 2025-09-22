// 5kl-backend/models/Offer.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    isOffer: {
        type: Boolean,
        default: false
    },
    price: {
        type: Number,
        min: 0
    }
}, {
    _id: false
});

const offerSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productVariation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariation',
        required: true
    },
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    initialProposedPrice: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'retracted', 'expired'],
        default: 'pending'
    },
    adminNotes: {
        type: String
    },
    acceptedPrice: {
        type: Number,
        min: 0
    },
    messages: [messageSchema],
    lastActivity: {
        type: Date,
        default: Date.now
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    notifications: [{ // AJOUTÉ : Pour lier les notifications directement à l'offre
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Notification'
    }],
    conversationId: { // AJOUTÉ : Pour regrouper les messages d'une même "conversation" d'offre
        type: String,
        unique: false, // MODIFIÉ : Ne doit pas être unique si un même client peut refaire une offre pour le même produit
        sparse: true,
        // C'est le _id de l'offre qui fait office de conversationId pour cette offre spécifique.
        // Si une nouvelle offre est créée pour le même produit, elle aura un nouveau _id, donc une nouvelle conversation.
        // L'idée de "réinitialiser le chat" est gérée en créant une NOUVELLE offre.
        // Ce champ peut être redéfini si on veut une conversation persistante indépendante des offres.
        // Pour l'instant, l'ID de l'offre est l'ID de la conversation.
        default: null // Ou le _id de l'offre lui-même après création
    }
}, {
    timestamps: true
});

// Middleware pour générer conversationId à partir de l'ID de l'offre elle-même si non défini
offerSchema.pre('save', function(next) {
    if (this.isNew && !this.conversationId) {
        this.conversationId = this._id.toString(); // L'ID de l'offre est l'ID de la conversation
    }
    if (this.isModified('messages') || this.isModified('status')) {
        this.lastActivity = Date.now();
    }
    next();
});


module.exports = mongoose.model('Offer', offerSchema);