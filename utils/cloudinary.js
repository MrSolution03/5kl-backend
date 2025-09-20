// 5kl-backend/utils/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config(); // Assurez-vous que les variables d'environnement sont chargées

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure le stockage pour Multer via Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: '5kl_ecommerce', // Dossier où les images seront stockées sur Cloudinary
        format: async (req, file) => 'jpeg', // Format de l'image (jpeg, png, etc.)
        public_id: (req, file) => file.fieldname + '-' + Date.now(), // Nom de fichier unique
        transformation: [{ width: 500, height: 500, crop: 'limit' }] // Optionnel: redimensionnement
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limite de taille de fichier à 5MB
    fileFilter: (req, file, cb) => {
        // Valide les types de fichiers (images uniquement)
        if (!file.mimetype.startsWith('image')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

module.exports = { cloudinary, upload };