// 5kl-backend/controllers/authController.js
const User = require('../models/User');
const { signToken, createSendToken } = require('../utils/authUtils'); // MODIFIÉ : Importe signToken et createSendToken
const Joi = require('joi');
const AppError = require('../utils/appError');
// const bcrypt = require('bcryptjs'); // Non directement utilisé ici car user.correctPassword est une méthode du modèle
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

// --- Schemas de Validation Joi (inchangés) ---
const registerSchema = Joi.object({
    username: Joi.string().min(3).max(30).optional(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    firstName: Joi.string().optional(),
    lastName: Joi.string().optional(),
    roles: Joi.array().items(Joi.string().valid('buyer', 'seller')).default(['buyer']),
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required()
});

const resetPasswordSchema = Joi.object({
    password: Joi.string().min(6).required(),
    passwordConfirm: Joi.string().valid(Joi.ref('password')).required()
});


// --- Fonctions des Contrôleurs ---

/**
 * @desc    Enregistrer un nouvel utilisateur (méthode traditionnelle)
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res, next) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { username, email, password, firstName, lastName, roles } = value;

        let user = await User.findOne({ email });
        if (user) {
            return next(new AppError('auth.userExistsEmail', 400));
        }

        if (username) {
            user = await User.findOne({ username });
            if (user) {
                return next(new AppError('auth.userExistsUsername', 400));
            }
        }

        user = await User.create({
            username,
            email,
            password,
            firstName,
            lastName,
            roles,
            isEmailVerified: false
        });

        // Utilise la nouvelle fonction pour envoyer le token
        createSendToken(user, 201, req, res);

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Connecter un utilisateur (méthode traditionnelle)
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
    // console.log('Login attempt for email:', req.body.email); // Log 1 pour débogage
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            // console.log('Login validation error:', error.details[0].message); // Log 2
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { email, password } = value;

        const user = await User.findOne({ email }).select('+password');

        // MODIFIÉ : Utilise la nouvelle méthode correctPassword du modèle User
        if (!user || !(await user.correctPassword(password, user.password))) {
            // console.log('Password mismatch or user not found for email:', email); // Log 3 & 4
            return next(new AppError('auth.invalidCredentials', 401));
        }

        // Vérifier si l'utilisateur est banni
        if (user.isBanned) {
            // console.log('Banned user tried to log in:', email); // Log 5
            return next(new AppError('auth.userBanned', 403, [user.bannedReason || req.t('auth.defaultBanReason')]));
        }

        // console.log('Login successful for user:', email); // Log 6
        createSendToken(user, 200, req, res); // Utilise la nouvelle fonction pour envoyer le token
    } catch (error) {
        // console.error('Unhandled error during login:', error); // Log 7
        next(error);
    }
};

/**
 * @desc    Callback pour l'authentification Google
 * @route   GET /api/auth/google/callback
 * @access  Public (géré par Passport)
 */
exports.googleCallback = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('auth.googleAuthFailed', 401));
    }

    // Vérifier si l'utilisateur est banni (pour OAuth aussi)
    if (req.user.isBanned) {
        const bannedReason = req.user.bannedReason || req.t('auth.defaultBanReason');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(req.t('auth.userBanned', bannedReason))}`);
    }

    createSendToken(req.user, 200, req, res); // Utilise la nouvelle fonction pour envoyer le token
};

/**
 * @desc    Callback pour l'authentification Facebook
 * @route   GET /api/auth/facebook/callback
 * @access  Public (géré par Passport)
 */
exports.facebookCallback = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('auth.facebookAuthFailed', 401));
    }

    // Vérifier si l'utilisateur est banni (pour OAuth aussi)
    if (req.user.isBanned) {
        const bannedReason = req.user.bannedReason || req.t('auth.defaultBanReason');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(req.t('auth.userBanned', bannedReason))}`);
    }

    createSendToken(req.user, 200, req, res); // Utilise la nouvelle fonction pour envoyer le token
};

/**
 * @desc    Demander une réinitialisation de mot de passe (envoyer un email avec lien)
 * @route   POST /api/auth/forgotpassword
 * @access  Public
 */
exports.forgotPassword = async (req, res, next) => {
    try {
        const { error, value } = forgotPasswordSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const user = await User.findOne({ email: value.email });
        if (!user) {
            return res.status(200).json({
                success: true,
                message: req.t('auth.forgotPasswordEmailSent')
            });
        }

        const resetToken = user.getResetPasswordToken();
        await user.save({ validateBeforeSave: false });

        const resetUrl = `${process.env.FRONTEND_URL}/resetpassword/${resetToken}`;
        const message = req.t('auth.forgotPasswordEmailContent', resetUrl);

        try {
            await sendEmail({
                email: user.email,
                subject: req.t('auth.forgotPasswordEmailSubject'),
                message
            });

            res.status(200).json({
                success: true,
                message: req.t('auth.forgotPasswordEmailSent')
            });
        } catch (err) {
            console.error(err);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });
            return next(new AppError('auth.emailSendFailed', 500));
        }

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Réinitialiser le mot de passe
 * @route   PUT /api/auth/resetpassword/:resettoken
 * @access  Public
 */
exports.resetPassword = async (req, res, next) => {
    try {
        const { error, value } = resetPasswordSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpires: { $gt: Date.now() }
        }).select('+password');

        if (!user) {
            return next(new AppError('auth.invalidResetToken', 400));
        }

        user.password = value.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        createSendToken(user, 200, req, res); // Utilise la nouvelle fonction pour envoyer le token

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Déconnecter un utilisateur
 * @route   GET /api/auth/logout
 * @access  Private (ou Public, efface juste le cookie)
 */
exports.logout = (req, res, next) => {
    res.cookie('jwt', 'loggedout', {
        expires: new Date(Date.now() + 10 * 1000), // Expire dans 10 secondes
        httpOnly: true,
        secure: req.protocol === 'https' || process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
    });

    res.status(200).json({ success: true, message: req.t('auth.logoutSuccess') }); // Nouvelle clé
};