// 5kl-backend/config/passport.js
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User'); // Votre modèle User
const dotenv = require('dotenv');

dotenv.config();

module.exports = function(passport) {
    // Stratégie Google
    passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL
        },
        async (accessToken, refreshToken, profile, done) => {
            const newUser = {
                googleId: profile.id,
                email: profile.emails[0].value,
                firstName: profile.name.givenName,
                lastName: profile.name.familyName,
                roles: ['buyer'], // Rôle par défaut
                isEmailVerified: true // Considéré comme vérifié par OAuth
            };

            try {
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    done(null, user);
                } else {
                    // Vérifier si l'email existe déjà sans Google ID
                    user = await User.findOne({ email: newUser.email });
                    if (user && !user.googleId) {
                        // Lier le compte existant à Google ID
                        user.googleId = newUser.googleId;
                        await user.save();
                        done(null, user);
                    } else if (user && user.googleId) {
                        // Email existant déjà lié à un autre compte Google ou erreur
                        return done(new Error('Email already registered with another Google account or login method.'), false);
                    } else {
                        user = await User.create(newUser);
                        done(null, user);
                    }
                }
            } catch (err) {
                console.error(err);
                done(err, false);
            }
        }
    ));

    // Stratégie Facebook
    passport.use(new FacebookStrategy({
            clientID: process.env.FACEBOOK_APP_ID,
            clientSecret: process.env.FACEBOOK_APP_SECRET,
            callbackURL: process.env.FACEBOOK_CALLBACK_URL,
            profileFields: ['id', 'displayName', 'emails', 'name'] // Champs requis
        },
        async (accessToken, refreshToken, profile, done) => {
            const newUser = {
                facebookId: profile.id,
                email: profile.emails ? profile.emails[0].value : null, // Facebook peut ne pas toujours fournir l'email
                firstName: profile.name.given_name,
                lastName: profile.name.family_name,
                roles: ['buyer'],
                isEmailVerified: true
            };

            try {
                let user = await User.findOne({ facebookId: profile.id });

                if (user) {
                    done(null, user);
                } else {
                    if (newUser.email) { // Si l'email est disponible
                        user = await User.findOne({ email: newUser.email });
                        if (user && !user.facebookId) {
                            user.facebookId = newUser.facebookId;
                            await user.save();
                            done(null, user);
                        } else if (user && user.facebookId) {
                            return done(new Error('Email already registered with another Facebook account or login method.'), false);
                        } else {
                            user = await User.create(newUser);
                            done(null, user);
                        }
                    } else { // Si l'email n'est pas disponible, créer un nouveau compte si aucun ID Facebook
                        user = await User.create(newUser);
                        done(null, user);
                    }
                }
            } catch (err) {
                console.error(err);
                done(err, false);
            }
        }
    ));

    // Sérialisation et désérialisation de l'utilisateur pour les sessions Passport (si utilisées)
    // Pas strictement nécessaire pour une API JWT pure, mais utile si vous décidez d'utiliser des sessions
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};
