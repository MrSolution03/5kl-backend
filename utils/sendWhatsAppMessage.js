// 5kl-backend/utils/sendWhatsAppMessage.js
const dotenv = require('dotenv');
const { translate } = require('./i18n'); // Pour la traduction des messages système

dotenv.config();

/**
 * @desc Envoie un message WhatsApp.
 * @param {string} phoneNumber - Numéro de téléphone du destinataire (format international, ex: +243812345678).
 * @param {string} message - Le message à envoyer.
 * @param {string} lang - La langue du destinataire pour la traduction des messages système.
 */
const sendWhatsAppMessage = async (phoneNumber, message, lang = 'fr') => {
    // TODO: Intégrer avec une API WhatsApp réelle ici (Twilio, WhatsApp Business API, etc.)
    // La configuration de l'API WhatsApp (clés, URL) devrait être dans .env
    // Exemple de variables d'environnement pour Twilio:
    // TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    // TWILIO_AUTH_TOKEN=your_auth_token
    // TWILIO_WHATSAPP_NUMBER=+14155238886 (votre numéro Twilio Sandbox ou Business)

    if (!phoneNumber) {
        console.warn(`[WhatsApp] Skipping message: Phone number is missing.`);
        return false;
    }

    if (process.env.NODE_ENV === 'development') {
        console.log(`--- SIMULATION ENVOI WHATSAPP ---`);
        console.log(`Destinataire: ${phoneNumber}`);
        console.log(`Langue: (${lang})`);
        console.log(`Message: ${message}`);
        console.log(`---------------------------------`);
        return true; // Simule un envoi réussi en développement
    }

    try {
        // --- Intégration réelle avec Twilio (exemple) ---
        // const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        // await client.messages.create({
        //     from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        //     to: 'whatsapp:' + phoneNumber,
        //     body: message
        // });
        // console.log(`[WhatsApp] Message sent to ${phoneNumber}.`);
        // return true;

        // --- Pour l'instant, sans API réelle, simule un envoi ---
        console.log(`[WhatsApp] Simulating real WhatsApp message to ${phoneNumber}.`);
        return true;

    } catch (error) {
        console.error(`[WhatsApp] Error sending message to ${phoneNumber}:`, error);
        // En production, vous pourriez vouloir loguer cette erreur dans un système d'alerte
        return false;
    }
};

module.exports = sendWhatsAppMessage;