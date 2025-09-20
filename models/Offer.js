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
    product: { // Référence au produit parent
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productVariation: { // MODIFIÉ : Référence à la variation spécifique
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
    }
}, {
    timestamps: true
});

offerSchema.pre('save', function (next) {
    if (this.isModified('messages') || this.isModified('status')) {
        this.lastActivity = Date.now();
    }
    next();
});

module.exports = mongoose.model('Offer', offerSchema);