// 5kl-backend/utils/sendEmail.js
const nodemailer = require('nodemailer'); // Assurez-vous d'avoir installé nodemailer: npm install nodemailer
const dotenv = require('dotenv');

dotenv.config();

const sendEmail = async (options) => {
    // Configuration de votre service de messagerie
    // Pour Gmail ou un autre service, vous auriez besoin de credentials
    // Pour des raisons de test/développement, vous pouvez utiliser Ethereal Mail ou un service comme Mailtrap.io
    // En production, utilisez un service de messagerie professionnel comme SendGrid, Mailgun, AWS SES, etc.

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT, // 587 pour TLS, 465 pour SSL
        secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD,
        },
        // Pour les environnements de développement, désactivez la vérification du certificat si vous utilisez Ethereal
        tls: {
            rejectUnauthorized: false
        }
    });

    const message = {
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        html: options.message,
    };

    try {
        const info = await transporter.sendMail(message);
        console.log(`Message sent: %s`, info.messageId);
        // En développement avec Ethereal, vous pouvez voir l'aperçu:
        if (process.env.NODE_ENV === 'development') {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        }
        return true; // Indiquer le succès de l'envoi
    } catch (error) {
        console.error("Error sending email:", error);
        // Si vous utilisez un service de test comme Ethereal, vous pouvez ignorer l'erreur
        if (process.env.NODE_ENV === 'development' && process.env.EMAIL_HOST === 'smtp.ethereal.email') {
             console.warn("Email sending failed in development with Ethereal. This is often expected for mock emails.");
             return true; // Traiter comme un succès pour le développement
        }
        throw new Error("Email could not be sent."); // Renvoyer l'erreur en production
    }
};

module.exports = sendEmail;