import { Strategy as SamlStrategy } from "@node-saml/passport-saml";
import passport from "passport";
import User from "../modules/users/user.model.js";

// La estrategia se crea lazy dentro de configureSaml para que dotenv
// ya haya cargado las variables de entorno antes de leerlas.
let samlStrategy;

const samlVerifyCallback = async (profile, done) => {
  try {
    const email =
      profile.email ||
      profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] ||
      profile.nameID;

    if (!email) {
      return done(new Error("No se recibió email desde Azure AD"), null);
    }

    const user = await User.findOne({ email: email.toLowerCase() });

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

    if (!user.directorioActivo) {
      user.directorioActivo = true;
      await user.save();
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
};

const samlLogoutCallback = async (profile, done) => {
  try {
    return done(null, {});
  } catch (error) {
    return done(error, null);
  }
};

export const getSamlStrategy = () => samlStrategy;

/**
 * Convierte un certificado X.509 (en cualquier formato) a PEM estándar:
 *   -----BEGIN CERTIFICATE-----
 *   <base64 en líneas de 64 chars>
 *   -----END CERTIFICATE-----
 * @node-saml requiere este formato para la verificación con xml-crypto.
 */
const normalizeCert = (raw) => {
  if (!raw) return null;
  const base64 = raw
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!base64) return null;
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
};

/**
 * Lee los certificados del IdP desde variables de entorno.
 * Soporta múltiples certs separados por coma (para rotación de Azure AD).
 *   SAML_IDP_CERT=cert1base64,cert2base64
 */
const loadIdpCerts = () => {
  const raw = process.env.SAML_IDP_CERT || "";
  const certs = raw.split(",").map(normalizeCert).filter(Boolean);
  if (certs.length === 0) {
    console.error("[SAML] ⚠️  SAML_IDP_CERT no está definido o está vacío.");
    return null;
  }
  console.log(`[SAML] ${certs.length} certificado(s) IdP cargado(s).`);
  certs.forEach((c, i) =>
    console.log(`[SAML]   cert[${i}] = ${c.slice(0, 30)}...${c.slice(-10)} (${c.length} chars)`)
  );
  // @node-saml acepta string o array
  return certs.length === 1 ? certs[0] : certs;
};

export const configureSaml = (passportInstance) => {
  const TENANT_ID = process.env.SAML_TENANT_ID;
  const APP_BASE_URL = process.env.APP_BASE_URL || "https://rosario.mozartai.com.co";

  const idpCert = loadIdpCerts();

  samlStrategy = new SamlStrategy(
    {
      // SP (nuestra aplicación)
      issuer: `${APP_BASE_URL}/api/auth/saml/metadata`,
      callbackUrl: `${APP_BASE_URL}/api/auth/saml/callback`,

      // IdP (Azure / Entra ID)
      entryPoint: `https://login.microsoftonline.com/${TENANT_ID}/saml2`,
      logoutUrl: `https://login.microsoftonline.com/${TENANT_ID}/saml2`,

      // Certificado(s) del IdP normalizados
      idpCert,

      // Azure AD puede firmar el Response, la Assertion, o ambos.
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: false,
      identifierFormat: null,
      disableRequestedAuthnContext: true,
      acceptedClockSkewMs: 10000,
      // Deshabilitamos la validación InResponseTo porque usamos JWT (stateless)
      // y en entornos serverless la sesión no garantiza persistencia entre invocaciones.
      validateInResponseTo: "never",
    },
    samlVerifyCallback,
    samlLogoutCallback
  );

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
