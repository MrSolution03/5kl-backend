// 5kl-backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { translate, DEFAULT_LOCALE } = require('../utils/i18n');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    email: {
        type: String,
        required: [true, function() { return translate(DEFAULT_LOCALE, 'auth.emailRequired'); }],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, function() { return translate(DEFAULT_LOCALE, 'auth.invalidEmail'); }] // Utilisez 'auth.invalidEmail' ou 'errors.invalidEmail'
    },
    password: {
        type: String,
        required: [true, function() { return translate(DEFAULT_LOCALE, 'auth.passwordRequired'); }],
        select: false
    },
    roles: [{
        type: String,
        enum: ['buyer', 'seller', 'admin'],
        default: 'buyer'
    }],
    firstName: {
        type: String,
        trim: true
    },
    lastName: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    addresses: [{
        street: { type: String, required: [true, function() { return translate(DEFAULT_LOCALE, 'user.address.streetRequired'); }], trim: true },
        city: { type: String, required: [true, function() { return translate(DEFAULT_LOCALE, 'user.address.cityRequired'); }], trim: true },
        state: { type: String, required: [true, function() { return translate(DEFAULT_LOCALE, 'user.address.stateRequired'); }], trim: true },
        zipCode: { type: String, required: [true, function() { return translate(DEFAULT_LOCALE, 'user.address.zipCodeRequired'); }], trim: true },
        country: { type: String, required: [true, function() { return translate(DEFAULT_LOCALE, 'user.address.countryRequired'); }], trim: true },
        isDefault: { type: Boolean, default: false }
    }],
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    facebookId: {
        type: String,
        unique: true,
        sparse: true
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    shop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop'
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastViewedVariations: [{
        variation: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariation' },
        timestamp: { type: Date, default: Date.now }
    }],
    orderHistoryArchivedAt: Date,
    offerHistoryArchivedAt: Date,
    isBanned: {
        type: Boolean,
        default: false
    },
    bannedReason: {
        type: String
    },
    bannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    profilePicture: { // AJOUTÉ : Pour la photo de profil de l'utilisateur
        type: String,
        default: null // URL de l l'image Cloudinary
    }
}, {
    timestamps: true
});

userSchema.pre('save', async function (next) {
    // Si le mot de passe n'a pas été modifié ou n'existe pas (ex: OAuth), passer
    if (!this.isModified('password') || !this.password) {
        return next();
    }
    // Hacher le mot de passe
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// MODIFIÉ : Renommé en correctPassword pour être plus sémantique
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
    if (!userPassword) return false;
    return await bcrypt.compare(candidatePassword, userPassword);
};

// Méthode pour générer un token de réinitialisation de mot de passe
userSchema.methods.getResetPasswordToken = function() {
    const resetToken = crypto.randomBytes(20).toString('hex');
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.resetPasswordExpires = Date.now() + parseInt(process.env.JWT_COOKIE_EXPIRES_IN, 10) * 24 * 60 * 60 * 1000; // Utilise JWT_COOKIE_EXPIRES_IN pour l'expiration du token
    return resetToken;
};

module.exports = mongoose.model('User', userSchema);