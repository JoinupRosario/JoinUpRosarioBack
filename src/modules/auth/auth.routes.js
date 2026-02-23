import express from "express";
import { registerUser, loginUser } from "./auth.controller.js";
import { samlLogin, samlCallback, samlMetadata, samlLogout } from "./saml.controller.js";

const router = express.Router();

// Autenticación local
router.post("/register", registerUser);
router.post("/login", loginUser);

// Autenticación SAML (Comunidad Universitaria - Azure AD / Entra ID)
router.get("/saml/login", samlLogin);
router.post("/saml/callback", samlCallback);
router.get("/saml/metadata", samlMetadata);
router.get("/saml/logout", samlLogout);

// Diagnóstico temporal: muestra fingerprint del cert cargado (NO exponer en prod permanente)
router.get("/saml/debug-cert", (req, res) => {
  const raw = process.env.SAML_IDP_CERT || "";
  const certs = raw.split(",").map(c => c.replace(/-----BEGIN CERTIFICATE-----/g,"").replace(/-----END CERTIFICATE-----/g,"").replace(/\s+/g,"").trim()).filter(Boolean);
  res.json({
    certsLoaded: certs.length,
    certs: certs.map(c => ({
      length: c.length,
      start: c.slice(0, 40),
      end: c.slice(-20),
    })),
  });
});

export default router;
