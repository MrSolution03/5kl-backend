// 5kl-backend/models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    product: { // AJOUTÉ : Référence au produit parent pour une facilité de population
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productVariation: { // MODIFIÉ : Référence à la variation de produit commandée
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariation',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    pricePaid: { // Le prix final réellement payé pour cet article
        type: Number,
        required: true,
        min: 0
    }
}, {
    _id: false
});

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [orderItemSchema],
    totalAmount: { // Montant total de la commande
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        enum: ['FC', 'USD'],
        default: 'FC'
    },
    exchangeRateUsed: {
        type: Number,
        min: 1,
        default: 1
    },
    shippingAddress: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true }
    },
    status: {
        type: String,
        enum: ['pending_admin_approval', 'accepted', 'rejected', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'],
        default: 'pending_admin_approval'
    },
    paymentMethod: {
        type: String,
        enum: ['pay_on_delivery'],
        default: 'pay_on_delivery',
        required: true
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    adminNotes: {
        type: String
    },
    deliveryTracking: [{
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        location: { type: String }
    }],
    offer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Offer'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);