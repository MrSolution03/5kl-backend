// 5kl-backend/models/Category.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: { // Pour des URLs plus propres (ex: /products/category/electroniques)
        type: String,
        unique: true,
        lowercase: true,
        trim: true
    },
    parentCategory: { // Pour les sous-catégories
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    description: {
        type: String,
        trim: true
    },
    image: { // Image représentative de la catégorie sur Cloudinary
        type: String
    }
}, {
    timestamps: true
});

// Middleware pour générer le slug automatiquement
categorySchema.pre('save', function(next) {
    if (this.isModified('name')) {
        this.slug = this.name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);