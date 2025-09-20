// 5kl-backend/controllers/authController.js
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const Joi = require('joi');
const AppError = require('../utils/appError');
const bcrypt = require('bcryptjs');
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

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: req.t('auth.registerSuccess'),
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                roles: user.roles,
                isEmailVerified: user.isEmailVerified,
            },
        });
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
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            error.statusCode = 400;
            error.isJoi = true;
            return next(error);
        }

        const { email, password } = value;

        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.matchPassword(password))) {
            return next(new AppError('auth.invalidCredentials', 401));
        }

        // AJOUTÉ : Vérifier si l'utilisateur est banni
        if (user.isBanned) {
            return next(new AppError('auth.userBanned', 403, [user.bannedReason || req.t('auth.defaultBanReason')])); // Nouvelle clé 'auth.defaultBanReason'
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: req.t('auth.loginSuccess'),
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                roles: user.roles,
                isEmailVerified: user.isEmailVerified,
            },
        });
    } catch (error) {
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

    // AJOUTÉ : Vérifier si l'utilisateur est banni (pour OAuth aussi)
    if (req.user.isBanned) {
        // Rediriger vers le frontend avec un message d'erreur si l'utilisateur est banni
        // Ou renvoyer une erreur JSON si la redirection n'est pas possible/souhaitée
        const bannedReason = req.user.bannedReason || req.t('auth.defaultBanReason');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(req.t('auth.userBanned', bannedReason))}`);
    }

    const token = generateToken(req.user._id);

    res.status(200).json({
        success: true,
        message: req.t('auth.googleAuthSuccess'),
        token,
        user: {
            id: req.user._id,
            username: req.user.username,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            roles: req.user.roles,
            isEmailVerified: req.user.isEmailVerified,
        },
        redirect: '/dashboard'
    });
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

    // AJOUTÉ : Vérifier si l'utilisateur est banni (pour OAuth aussi)
    if (req.user.isBanned) {
        const bannedReason = req.user.bannedReason || req.t('auth.defaultBanReason');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(req.t('auth.userBanned', bannedReason))}`);
    }

    const token = generateToken(req.user._id);

    res.status(200).json({
        success: true,
        message: req.t('auth.facebookAuthSuccess'),
        token,
        user: {
            id: req.user._id,
            username: req.user.username,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            roles: req.user.roles,
            isEmailVerified: req.user.isEmailVerified,
        },
        redirect: '/dashboard'
    });
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

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: req.t('auth.passwordResetSuccess'),
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                roles: user.roles,
            },
        });

    } catch (error) {
        next(error);
    }
};