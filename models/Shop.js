// 5kl-backend/models/Shop.js
const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Shop name is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Shop name must be at least 3 characters long']
    },
    owner: { // Le vendeur propriétaire de la boutique
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Shop must have an owner']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Shop description cannot exceed 500 characters']
    },
    logo: { // URL de l'image du logo sur Cloudinary
        type: String,
        // TODO: REMPLACER 'your_cloud_name' par le vôtre dans .env ou la configuration Cloudinary
        default: 'https://res.cloudinary.com/your_cloud_name/image/upload/v1700000000/default-shop-logo.png' // Exemple de lien par défaut
    },
    products: [{ // Référence aux produits de cette boutique (populé si nécessaire)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    isActive: { // Si la boutique est actuellement active
        type: Boolean,
        default: true
    },
    isApproved: { // L'administrateur doit approuver les boutiques avant qu'elles ne soient visibles au public
        type: Boolean,
        default: false
    },
    address: { // Adresse de la boutique (peut être différente de l'adresse de l'utilisateur)
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zipCode: { type: String, trim: true },
        country: { type: String, trim: true }
    },
    phone: {
        type: String,
        trim: true,
        match: [/^\+?\d{8,15}$/, 'Please fill a valid phone number'] // Exemple de regex pour un numéro de téléphone international
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    }
}, {
    timestamps: true // Ajoute createdAt et updatedAt
});

// Middleware pour s'assurer que l'utilisateur propriétaire est bien un 'seller'
shopSchema.pre('save', async function (next) {
    const User = mongoose.model('User');
    const ownerUser = await User.findById(this.owner);
    if (ownerUser && !ownerUser.roles.includes('seller')) {
        ownerUser.roles.push('seller'); // Ajoutez le rôle 'seller' si ce n'est pas déjà le cas
        await ownerUser.save({ validateBeforeSave: false }); // Évitez les boucles infinies de pre('save')
    }
    next();
});

module.exports = mongoose.model('Shop', shopSchema);