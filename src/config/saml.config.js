import { Strategy as SamlStrategy } from "@node-saml/passport-saml";
import passport from "passport";
import User from "../modules/users/user.model.js";

const TENANT_ID = process.env.SAML_TENANT_ID;
const APP_BASE_URL = process.env.APP_BASE_URL || "https://rosario.mozartai.com.co";

export const samlStrategy = new SamlStrategy(
  {
    // SP (nuestra aplicación)
    issuer: `${APP_BASE_URL}/api/auth/saml/metadata`,
    callbackUrl: `${APP_BASE_URL}/api/auth/saml/callback`,

    // IdP (Azure / Entra ID)
    entryPoint: `https://login.microsoftonline.com/${TENANT_ID}/saml2`,
    logoutUrl: `https://login.microsoftonline.com/${TENANT_ID}/saml2`,

    // Certificado del IdP (extraído del XML de metadatos que te enviaron)
    idpCert: process.env.SAML_IDP_CERT,

    // Opciones de comportamiento
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: true,
    identifierFormat: null,
    disableRequestedAuthnContext: true,
    acceptedClockSkewMs: 5000,
  },
  // Callback de verificación (login)
  async (profile, done) => {
    try {
      const email =
        profile.email ||
        profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] ||
        profile.nameID;

      const name =
        profile.displayName ||
        profile["http://schemas.microsoft.com/identity/claims/displayname"] ||
        profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"] ||
        email;

      if (!email) {
        return done(new Error("No se recibió email desde Azure AD"), null);
      }

      let user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return done(null, false, {
          message: `Usuario ${email} no está registrado en la plataforma. Contacte al administrador.`,
        });
      }

      if (!user.estado) {
        return done(null, false, {
          message: "Su cuenta está inactiva. Contacte al administrador.",
        });
      }

      // Marcar que este usuario usa directorio activo
      if (!user.directorioActivo) {
        user.directorioActivo = true;
        await user.save();
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  },
  // Callback de verificación (logout)
  async (profile, done) => {
    try {
      return done(null, {});
    } catch (error) {
      return done(error, null);
    }
  }
);

export const configureSaml = (passportInstance) => {
  passportInstance.use("saml", samlStrategy);

  passportInstance.serializeUser((user, done) => {
    done(null, user._id.toString());
  });

  passportInstance.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};

export default passport;
