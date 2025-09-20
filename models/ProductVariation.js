// 5kl-backend/models/ProductVariation.js
const mongoose = require('mongoose');

const productVariationSchema = new mongoose.Schema({
    product: { // Le produit parent auquel cette variation appartient
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    sku: { // Stock Keeping Unit - Unique pour cette variation
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    attributes: [{ // Ex: [{ key: 'color', value: 'red' }, { key: 'size', value: 'M' }]
        key: { type: String, required: true, trim: true },
        value: { type: String, required: true, trim: true }
    }],
    price: { // Prix spécifique à cette variation (peut dériver du produit parent)
        type: Number,
        required: true,
        min: 0.01
    },
    stock: { // Stock disponible pour cette variation spécifique
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    images: [{ // Images spécifiques à cette variation (peut dériver du produit parent)
        type: String // URLs Cloudinary
    }],
    isAvailable: { // Si cette variation est active/disponible à la vente
        type: Boolean,
        default: true
    },
    lowStockThreshold: { // Seuil d'alerte de stock faible pour cette variation
        type: Number,
        default: 10,
        min: 0
    }
}, {
    timestamps: true
});

// Index composé pour s'assurer qu'un produit n'a pas deux variations avec les mêmes attributs
// Example: un produit ne peut pas avoir deux variations "red, M"
productVariationSchema.index({ product: 1, 'attributes.key': 1, 'attributes.value': 1 }, { unique: true });

module.exports = mongoose.model('ProductVariation', productVariationSchema);