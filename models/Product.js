// 5kl-backend/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    images: [{ // URLs des images sur Cloudinary
        type: String
    }],
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    subCategory: { // Peut être null
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    },
    shop: { // La boutique qui vend le produit
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
        required: true
    },
    brand: { // La marque du produit (peut être null)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand'
    },
    stock: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    sku: { // Stock Keeping Unit (référence unique)
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    attributes: [{ // Attributs dynamiques pour le filtrage improvisé (ex: couleur, taille, matière)
        key: { type: String, trim: true },
        value: { type: String, trim: true }
    }],
    // Ajout d'un champ pour le prix de comparaison ou le prix d'origine si négocié
    originalPrice: {
        type: Number
    },
}, {
    timestamps: true
});

// Index pour la recherche rapide
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, subCategory: 1, price: 1, brand: 1, shop: 1 });

module.exports = mongoose.model('Product', productSchema);