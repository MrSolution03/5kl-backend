// 5kl-backend/createAdmins.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User'); // Votre modèle User

dotenv.config(); // Charger les variables d'environnement

const connectToAdminScriptDB = async () => {
    try {
        // Connexion Mongoose moderne, sans options obsolètes
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected for admin creation script.');
    } catch (err) {
        console.error('MongoDB connection error in admin creation script:', err);
        process.exit(1);
    }
};

const createAdmins = async () => {
    await connectToAdminScriptDB(); // Appeler la fonction de connexion

    // AJOUTÉ : Le tableau complet des administrateurs à créer
    const adminsToCreate = [
        {
            firstName: "Andy",
            lastName: "Manager",
            email: "andy@5kl.com",
            password: "PasswordAndy123!",
            roles: ["admin", "buyer"] // Peut être un admin + acheteur par défaut
        },
        {
            firstName: "Eliel",
            lastName: "Support",
            email: "eliel@5kl.com",
            password: "PasswordEliel123!",
            roles: ["admin", "buyer"]
        },
        {
            firstName: "Super",
            lastName: "Admin",
            email: "superadmin@5kl.com",
            password: "PasswordAdmin123!",
            roles: ["admin", "buyer", "seller"] // Un admin peut avoir tous les rôles
        }
    ];

    for (const adminData of adminsToCreate) {
        try {
            // Vérifier si un utilisateur avec cet email existe déjà
            const existingUser = await User.findOne({ email: adminData.email });
            if (existingUser) {
                console.log(`Admin user with email ${adminData.email} already exists. Skipping.`);
                // Optionnel: mettre à jour son rôle si l'utilisateur existe mais n'est pas admin
                // if (!existingUser.roles.includes('admin')) {
                //     existingUser.roles = [...new Set([...existingUser.roles, ...adminData.roles])]; // Ajoute les nouveaux rôles sans doublon
                //     await existingUser.save({ validateBeforeSave: false });
                //     console.log(`Updated roles for ${adminData.email} to include 'admin'.`);
                // }
            } else {
                const newAdmin = new User(adminData);
                await newAdmin.save(); // Le middleware pre('save') du modèle va hacher le mot de passe
                console.log(`Admin user ${newAdmin.email} created successfully.`);
            }
        } catch (error) {
            console.error(`Error creating admin user ${adminData.email}:`, error);
        }
    }

    console.log('Admin creation process finished.');
    await mongoose.connection.close(); // S'assurer que la connexion est fermée proprement
};

createAdmins();