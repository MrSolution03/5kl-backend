// 5kl-backend/utils/notificationService.js
const Notification = require('../models/Notification');
const User = require('../models/User');
const sendWhatsAppMessage = require('./sendWhatsAppMessage');
const { translate } = require('./i18n');

// ID de l'administrateur système pour les notifications (à définir dans .env ou trouver dynamiquement)
// Vous pouvez définir un ADMIN_SYSTEM_EMAIL dans .env et le chercher une fois au démarrage du service.
let adminUserId = null;
const getAdminUserId = async () => {
    if (!adminUserId) {
        const adminUser = await User.findOne({ roles: 'admin' });
        if (adminUser) {
            adminUserId = adminUser._id;
        } else {
            console.warn('NotificationService: No admin user found. Admin notifications will not be sent.');
        }
    }
    return adminUserId;
};


/**
 * @desc Crée une notification in-app et tente d'envoyer un message WhatsApp.
 * @param {Object} options - Options pour la notification.
 * @param {mongoose.Types.ObjectId|String|Array<mongoose.Types.ObjectId|String>} options.recipientId - ID(s) de l'utilisateur destinataire.
 * @param {mongoose.Types.ObjectId|String} [options.senderId=null] - ID de l'expéditeur (ex: l'admin qui agit).
 * @param {string} options.type - Type de notification (ex: 'order_status', 'offer_update').
 * @param {string} options.titleKey - Clé de traduction pour le titre.
 * @param {string} options.messageKey - Clé de traduction pour le message.
 * @param {Array<any>} [options.messageArgs=[]] - Arguments pour la traduction du message.
 * @param {Object} [options.relatedEntity=null] - Entité liée (id et type).
 * @param {boolean} [options.sendWhatsapp=false] - Si la notification doit aussi être envoyée par WhatsApp.
 */
const sendNotification = async (options) => {
    const {
        recipientId,
        senderId = null,
        type,
        titleKey,
        messageKey,
        messageArgs = [],
        relatedEntity = null,
        sendWhatsapp = false
    } = options;

    if (!recipientId) {
        console.warn('sendNotification: Recipient ID is missing, skipping notification.');
        return;
    }

    const recipientIds = Array.isArray(recipientId) ? recipientId : [recipientId];
    const notifications = [];

    for (const id of recipientIds) {
        try {
            const recipient = await User.findById(id).select('locale whatsappNumber whatsappNotificationsEnabled');
            if (!recipient) {
                console.warn(`sendNotification: Recipient user ${id} not found, skipping.`);
                continue;
            }

            const recipientLocale = recipient.locale || 'fr';

            // 1. Créer la notification in-app
            const notification = await Notification.create({
                recipient: id,
                sender: senderId,
                type,
                title: translate(recipientLocale, titleKey, messageArgs),
                message: translate(recipientLocale, messageKey, messageArgs),
                relatedEntity: relatedEntity
            });
            notifications.push(notification);
            // console.log(`Notification created for user ${id}: ${notification.title}`);

            // 2. Envoyer par WhatsApp si demandé et activé
            if (sendWhatsapp && recipient.whatsappNotificationsEnabled && recipient.whatsappNumber) {
                const whatsappMessage = translate(recipientLocale, messageKey, messageArgs);
                await sendWhatsAppMessage(recipient.whatsappNumber, whatsappMessage, recipientLocale);
            }
        } catch (error) {
            console.error(`Error processing notification for recipient ${id}:`, error);
        }
    }
    return notifications;
};


/**
 * @desc Envoie une notification à l'administrateur système (tous les utilisateurs avec le rôle 'admin').
 * @param {Object} options - Options pour la notification (sans recipientId).
 */
const sendNotificationToAdmin = async (options) => {
    try {
        const admins = await User.find({ roles: 'admin' }).select('_id locale whatsappNumber whatsappNotificationsEnabled');
        if (admins.length === 0) {
            console.warn('sendNotificationToAdmin: No admin users found to send notification to.');
            return;
        }
        const adminIds = admins.map(admin => admin._id);
        
        await sendNotification({ ...options, recipientId: adminIds, sendWhatsapp: true }); // Les admins reçoivent aussi via WhatsApp
    } catch (error) {
        console.error('Error sending notification to admin:', error);
    }
};

module.exports = {
    sendNotification,
    sendNotificationToAdmin,
    getAdminUserId // Exporter si vous en avez besoin pour des vérifications
};