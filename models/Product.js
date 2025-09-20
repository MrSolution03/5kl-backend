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
    // price et stock ne sont plus ici, ils sont gérés au niveau des variations
    images: [{ // Images générales du produit (les variations peuvent avoir des images spécifiques)
        type: String // URLs des images sur Cloudinary
    }],
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    subCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    },
    shop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
        required: true
    },
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand'
    },
    // isAvailable est maintenant calculé à partir de l'état des variations
    // sku est maintenant géré par les variations
    attributes: [{ // Attributs du produit (définissent les types de variations possibles)
        key: String,
        value: String
    }],
    // originalPrice est maintenant géré par les variations si applicable
    // Un champ pour le prix min/max agrégé des variations pour la recherche rapide
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 }, // Stock total agrégé de toutes les variations
    isAvailable: { type: Boolean, default: false } // Vrai si au moins une variation est disponible
}, {
    timestamps: true
});

// Middleware pour calculer minPrice, maxPrice et totalStock à partir des variations
productSchema.pre('save', async function(next) {
    if (this.isModified('variations') || this.isNew) { // Si les variations sont gérées via un sous-document, ce n'est pas le cas ici
        // Ce calcul sera fait après la création/mise à jour d'une variation
        // Ou via un hook post('save') sur ProductVariation
    }
    next();
});

// Méthode pour obtenir le prix et le stock agrégés
productSchema.methods.updateAggregatedData = async function() {
    const variations = await mongoose.model('ProductVariation').find({ product: this._id, isAvailable: true });

    if (variations.length === 0) {
        this.minPrice = 0;
        this.maxPrice = 0;
        this.totalStock = 0;
        this.isAvailable = false;
    } else {
        this.minPrice = Math.min(...variations.map(v => v.price));
        this.maxPrice = Math.max(...variations.map(v => v.price));
        this.totalStock = variations.reduce((acc, v) => acc + v.stock, 0);
        this.isAvailable = variations.some(v => v.stock > 0 && v.isAvailable);
    }
    await this.save({ validateBeforeSave: false }); // Évite les boucles de validation
};

productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, subCategory: 1, minPrice: 1, maxPrice: 1, brand: 1, shop: 1 });

module.exports = mongoose.model('Product', productSchema);