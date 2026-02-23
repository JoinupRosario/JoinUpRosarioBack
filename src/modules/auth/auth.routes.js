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

export default router;
