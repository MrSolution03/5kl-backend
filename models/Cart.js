// 5kl-backend/models/Cart.js
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    priceAtAddToCart: { // Prix de l'article dans la devise du panier
        type: Number,
        required: true
    }
}, {
    _id: false
});

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [cartItemSchema],
    totalPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: { // AJOUTÉ
        type: String,
        uppercase: true,
        enum: ['FC', 'USD'],
        default: process.env.DEFAULT_CURRENCY || 'FC'
    }
}, {
    timestamps: true
});

cartSchema.pre('save', function (next) {
    this.totalPrice = this.items.reduce((acc, item) => acc + (item.quantity * item.priceAtAddToCart), 0);
    next();
});

module.exports = mongoose.model('Cart', cartSchema);