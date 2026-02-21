import passport from "passport";
import jwt from "jsonwebtoken";
import { samlStrategy } from "../../config/saml.config.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://rosario.mozartai.com.co";

/**
 * GET /api/auth/saml/login
 * Redirige al usuario a la página de login de Azure AD (Entra ID).
 */
export const samlLogin = passport.authenticate("saml", {
  failureRedirect: `${FRONTEND_URL}/login?error=saml_init_failed`,
  session: true,
});

/**
 * POST /api/auth/saml/callback
 * Azure llama a este endpoint con la aserción SAML tras autenticar al usuario.
 */
export const samlCallback = (req, res, next) => {
  passport.authenticate("saml", { session: true }, (err, user, info) => {
    if (err) {
      console.error("[SAML] Error en callback:", err);
      return res.redirect(`${FRONTEND_URL}/#/login?error=saml_error`);
    }

    if (!user) {
      const message = info?.message || "Acceso denegado";
      console.warn("[SAML] Autenticación fallida:", message);
      return res.redirect(
        `${FRONTEND_URL}/#/login?error=saml_unauthorized&msg=${encodeURIComponent(message)}`
      );
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error("[SAML] Error al hacer login:", loginErr);
        return res.redirect(`${FRONTEND_URL}/#/login?error=saml_session_error`);
      }

      // Generar JWT con los mismos campos que el login normal
      const token = jwt.sign(
        { id: user._id, modulo: user.modulo },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );

      console.log(`[SAML] Login exitoso: ${user.email} (módulo: ${user.modulo})`);

      // Redirigir al frontend con el token. Se usa /#/ porque el frontend usa HashRouter
      return res.redirect(`${FRONTEND_URL}/#/auth/saml-success?token=${token}`);
    });
  })(req, res, next);
};

/**
 * GET /api/auth/saml/metadata
 * Expone el XML de metadata del SP (Service Provider).
 * Útil para que la universidad valide la configuración en Azure.
 */
export const samlMetadata = (req, res) => {
  try {
    const metadata = samlStrategy.generateServiceProviderMetadata(null, null);
    res.type("application/xml");
    res.status(200).send(metadata);
  } catch (error) {
    console.error("[SAML] Error generando metadata:", error);
    res.status(500).json({ message: "Error generando metadata SAML" });
  }
};

/**
 * GET /api/auth/saml/logout
 * Inicia el cierre de sesión en Azure AD.
 */
export const samlLogout = (req, res) => {
  if (!req.user) {
    return res.redirect(`${FRONTEND_URL}/login`);
  }

  req.logout((err) => {
    if (err) {
      console.error("[SAML] Error en logout:", err);
    }
    req.session.destroy(() => {
      res.redirect(`${FRONTEND_URL}/login`);
    });
  });
};
