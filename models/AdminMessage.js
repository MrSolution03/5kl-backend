// 5kl-backend/models/AdminMessage.js
const mongoose = require('mongoose');

const adminMessageSchema = new mongoose.Schema({
    sender: { // L'administrateur qui a envoyé le message
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipientType: { // Type de destinataire : 'all', 'buyer', 'seller', 'user'
        type: String,
        enum: ['all', 'buyer', 'seller', 'user'],
        required: true
    },
    recipientUser: { // Si recipientType est 'user', spécifie l'ID de l'utilisateur
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        sparse: true // Permet à de multiples documents d'avoir un recipientUser: null
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
    },
    sentAt: {
        type: Date,
        default: Date.now
    },
    // Vous pouvez ajouter un champ pour marquer si l'utilisateur a lu le message, si besoin
    // readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, {
    timestamps: true // Ajoute createdAt et updatedAt
});

module.exports = mongoose.model('AdminMessage', adminMessageSchema);