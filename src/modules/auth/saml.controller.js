import passport from "passport";
import jwt from "jsonwebtoken";
import { getSamlStrategy } from "../../config/saml.config.js";

const getFrontendUrl = () =>
  process.env.FRONTEND_URL || "https://rosario.mozartai.com.co";

/** Destruye la sesión actual y llama al callback cuando termina (o de inmediato si no hay sesión). */
const destroySession = (req, cb) => {
  if (req.session) {
    req.session.destroy(() => cb());
  } else {
    cb();
  }
};

/**
 * GET /api/auth/saml/login
 * Limpia cualquier sesión SAML rota antes de iniciar un nuevo flujo con Azure AD.
 */
export const samlLogin = (req, res, next) => {
  // Regenerar la sesión para evitar que estado SAML anterior cause conflictos
  if (req.session) {
    req.session.regenerate((err) => {
      if (err) console.warn("[SAML] No se pudo regenerar sesión antes del login:", err);
      passport.authenticate("saml", {
        failureRedirect: `${getFrontendUrl()}/#/login?error=saml_init_failed`,
        session: true,
      })(req, res, next);
    });
  } else {
    passport.authenticate("saml", {
      failureRedirect: `${getFrontendUrl()}/#/login?error=saml_init_failed`,
      session: true,
    })(req, res, next);
  }
};

/**
 * POST /api/auth/saml/callback
 * Azure llama a este endpoint con la aserción SAML tras autenticar al usuario.
 */
export const samlCallback = (req, res, next) => {
  const FRONTEND_URL = getFrontendUrl();

  // 303 See Other fuerza al browser a hacer GET en la URL de destino,
  // evitando que el POST de Azure AD se propague al frontend (307 lo propagaría).
  const safeRedirect = (url) => res.redirect(303, url);

  passport.authenticate("saml", { session: false }, (err, user, info) => {
    if (err) {
      console.error("[SAML] Error en callback:", err?.message || err);
      return destroySession(req, () =>
        safeRedirect(`${FRONTEND_URL}/#/login?error=saml_error&msg=${encodeURIComponent(err?.message || "Error SAML")}`)
      );
    }

    if (!user) {
      const message = info?.message || "Acceso denegado";
      console.warn("[SAML] Autenticación fallida:", message);
      return destroySession(req, () =>
        safeRedirect(
          `${FRONTEND_URL}/#/login?error=saml_unauthorized&msg=${encodeURIComponent(message)}`
        )
      );
    }

    // Generar JWT con los mismos campos que el login normal
    const token = jwt.sign(
      { id: user._id, modulo: user.modulo },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    console.log(`[SAML] Login exitoso: ${user.email} (módulo: ${user.modulo})`);

    // 303 también aquí para que el browser haga GET al frontend con el token
    return safeRedirect(`${FRONTEND_URL}/#/auth/saml-success?token=${token}`);
  })(req, res, next);
};

/**
 * GET /api/auth/saml/metadata
 * Expone el XML de metadata del SP (Service Provider).
 * Útil para que la universidad valide la configuración en Azure.
 */
export const samlMetadata = (req, res) => {
  try {
    const metadata = getSamlStrategy().generateServiceProviderMetadata(null, null);
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
