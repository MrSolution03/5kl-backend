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
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, function() { return translate(DEFAULT_LOCALE, 'auth.emailInvalid'); }]
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
    lastViewedProducts: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        timestamp: { type: Date, default: Date.now }
    }],
    orderHistoryArchivedAt: Date,
    offerHistoryArchivedAt: Date,
    preferredCurrency: { // CHAMP AJOUTÉ : Pour la devise préférée de l'utilisateur
        type: String,
        uppercase: true,
        enum: ['FC', 'USD'], // Ajoutez d'autres devises si supportées
        default: process.env.DEFAULT_CURRENCY || 'FC'
    }
}, {
    timestamps: true
});

// Middleware Mongoose pour hacher le mot de passe avant de sauvegarder
userSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Méthode pour comparer les mots de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

// Méthode pour générer un token de réinitialisation de mot de passe
userSchema.methods.getResetPasswordToken = function() {
    const resetToken = crypto.randomBytes(20).toString('hex');
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 heure
    return resetToken;
};

module.exports = mongoose.model('User', userSchema);