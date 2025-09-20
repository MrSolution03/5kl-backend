// 5kl-backend/models/Brand.js
const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    logo: { // URL de l'image du logo sur Cloudinary
        type: String,
        // Utilisez votre propre CLOUDINARY_CLOUD_NAME ici pour un lien par défaut
        default: 'https://res.cloudinary.com/your_cloud_name/image/upload/v1/default-brand-logo.png'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Brand', brandSchema);