// 5kl-backend/models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
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
    currency: { // AJOUTÉ : La devise utilisée pour cette commande
        type: String,
        enum: ['FC', 'USD'],
        default: 'FC'
    },
    exchangeRateUsed: { // AJOUTÉ : Le taux de change USD_TO_FC_RATE au moment de la commande
        type: Number,
        min: 1,
        default: 1 // Si FC par défaut, le taux est 1 si on considère FC comme base
    },
    shippingAddress: { // Adresse de livraison au moment de la commande
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
    isPaid: { // AJOUTÉ : Pour le mode pay-on-delivery, sera mis à jour après la livraison par l'admin
        type: Boolean,
        default: false
    },
    adminNotes: { // Raison de rejet, commentaires de l'admin
        type: String
    },
    deliveryTracking: [{ // Historique des statuts de livraison
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        location: { type: String } // Optionnel: lieu de la mise à jour
    }],
    offer: { // Référence à l'offre si la commande est le résultat d'une négociation
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Offer'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);