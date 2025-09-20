// 5kl-backend/models/Cart.js
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    productVariation: { // MODIFIÉ : Référence à la variation de produit
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariation',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    priceAtAddToCart: { // Prix du produit au moment de l'ajout au panier.
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
}, {
    timestamps: true
});

// Middleware ou méthode pour mettre à jour le totalPrice avant la sauvegarde
cartSchema.pre('save', async function (next) {
    // Si des articles sont ajoutés/modifiés, recalculez le prix total
    if (this.isModified('items')) {
        const ProductVariation = mongoose.model('ProductVariation');
        let calculatedPrice = 0;
        for (const item of this.items) {
            // Recalcule le prix en cas de modification du prix dans la variation,
            // mais l'idée est que priceAtAddToCart est fixe une fois ajouté
            // Cependant, on peut re-vérifier le prix actuel de la variation si on veut
            const variation = await ProductVariation.findById(item.productVariation);
            if (variation) {
                calculatedPrice += item.quantity * item.priceAtAddToCart; // Utilise le prix enregistré dans le panier
            } else {
                // Gérer le cas où la variation n'existe plus
                console.warn(`Product variation ${item.productVariation} not found for cart item.`);
            }
        }
        this.totalPrice = calculatedPrice;
    }
    next();
});

module.exports = mongoose.model('Cart', cartSchema);