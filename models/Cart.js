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
    // Le prix du produit au moment de l'ajout au panier.
    // Si un prix négocié est accepté, ce sera ce prix.
    priceAtAddToCart: {
        type: Number,
        required: true
    }
}, {
    _id: false // Pas besoin d'un _id pour chaque sous-document d'article du panier
});

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // Un seul panier par utilisateur
    },
    items: [cartItemSchema],
    totalPrice: { // Calculé dynamiquement ou mis à jour par le backend
        type: Number,
        default: 0,
        min: 0
    },
}, {
    timestamps: true
});

// Middleware ou méthode pour mettre à jour le totalPrice avant la sauvegarde
cartSchema.pre('save', function (next) {
    this.totalPrice = this.items.reduce((acc, item) => acc + (item.quantity * item.priceAtAddToCart), 0);
    next();
});

module.exports = mongoose.model('Cart', cartSchema);