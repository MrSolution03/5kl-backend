// 5kl-backend/createAdmins.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User'); // Votre modèle User

dotenv.config(); // Charger les variables d'environnement

const connectToAdminScriptDB = async () => {
    try {
        // MODIFIÉ : Connexion Mongoose moderne, sans options obsolètes
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected for admin creation script.');
    } catch (err) {
        console.error('MongoDB connection error in admin creation script:', err);
        process.exit(1);
    }
};

const createAdmins = async () => {
    await connectToAdminScriptDB(); // Appeler la fonction de connexion

    const adminsToCreate = [
        // ... (le reste de vos données d'admins)
    ];

    for (const adminData of adminsToCreate) {
        // ... (le reste de votre logique de création d'admins)
    }

    console.log('Admin creation process finished.');
    await mongoose.connection.close(); // S'assurer que la connexion est fermée proprement
};

createAdmins();