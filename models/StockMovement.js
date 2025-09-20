// 5kl-backend/models/StockMovement.js
const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
    variation: { // La variation de produit concernée par le mouvement
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariation',
        required: true
    },
    product: { // Le produit parent (pour une référence facile)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    type: { // Type de mouvement : 'in' (entrée), 'out' (sortie), 'adjustment' (ajustement manuel)
        type: String,
        enum: ['in', 'out', 'adjustment'],
        required: true
    },
    quantity: { // Quantité de produits impliqués dans le mouvement
        type: Number,
        required: true,
        min: 1
    },
    reason: { // Raison du mouvement (ex: 'vente', 'retour client', 'réception fournisseur', 'casse')
        type: String,
        required: true,
        trim: true
    },
    reference: { // Référence externe (ex: ID de commande, numéro de bon de livraison)
        type: String,
        trim: true
    },
    movedBy: { // L'utilisateur (admin ou vendeur) qui a initié le mouvement
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    currentStock: { // Le stock après ce mouvement (snapshot)
        type: Number
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('StockMovement', stockMovementSchema);