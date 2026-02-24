import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "passport";
import connectDB from "./config/db.js";
import { configureSaml } from "./config/saml.config.js";
import routes from "./routes/index.js";
import { handleUploadError } from "./middlewares/upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Configurar estrategia SAML en passport
configureSaml(passport);

// En local, conectar DB al arrancar
if (process.env.VERCEL !== "1") {
  connectDB();
}

// ── CORS debe ser lo primero — antes de session, passport y cualquier otro middleware ──
// Si session/DB falla en Vercel y CORS no corrió aún, el browser ve un error CORS en vez del 500 real.
const ALLOWED_ORIGINS = [
  "https://new.rosario.mozartia.com",
  "https://rosario.mozartai.com.co",
  "https://join-up-rosario-front.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("No permitido por CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Authorization"],
  optionsSuccessStatus: 200,
};

// Preflight OPTIONS: responder inmediatamente, antes de que cualquier otro middleware pueda fallar
// Nota: se usa regex /(.*)/ en vez de "*" porque path-to-regexp v8+ no acepta wildcard sin nombre
app.options(/(.*)/, (req, res, next) => {
  // Rutas SAML: Microsoft no envía Origin normal, dejar pasar sin restricción
  if (req.path.startsWith("/api/auth/saml")) return res.sendStatus(200);
  return cors(corsOptions)(req, res, () => res.sendStatus(200));
});

// CORS para el resto de peticiones normales (no SAML)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth/saml")) return next();
  return cors(corsOptions)(req, res, next);
});

// ── Resto de middlewares (después de CORS) ─────────────────────────────────

// En Vercel, conectar DB de forma lazy — va DESPUÉS de CORS para que OPTIONS no falle
if (process.env.VERCEL === "1") {
  let dbConnecting = false;
  app.use(async (req, res, next) => {
    if (mongoose.connection.readyState === 0 && !dbConnecting) {
      dbConnecting = true;
      try {
        await connectDB();
      } catch (error) {
        console.error("Error conectando a DB en Vercel:", error);
        dbConnecting = false;
      }
    }
    next();
  });
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Sesión necesaria para el flujo SAML (se almacena en MongoDB)
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 8 * 60 * 60,
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(morgan("dev"));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());

// Middleware de debugging antes de rutas
app.use("/api", (req, res, next) => {
  console.log(`🚀 [SERVER] Petición recibida: ${req.method} ${req.originalUrl}`);
  next();
});

// Servir archivos estáticos de uploads
// Los archivos se guardan en src/uploads/, __dirname es src/
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ruta de prueba para verificar que el servidor funciona
app.get("/", (req, res) => {
  res.json({ message: "Servidor funcionando correctamente", timestamp: new Date().toISOString() });
});

// Rutas principales
app.use("/api", routes);

// Middleware para manejo de errores de multer
app.use(handleUploadError);

// Error 404
app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

// Manejo global de errores
app.use((error, req, res, next) => {
  console.error("Error:", error);

  if (error.name === "ValidationError") {
    return res.status(400).json({
      message: "Error de validación",
      errors: Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      })),
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({ message: "ID inválido" });
  }

  if (error.code === 11000) {
    return res.status(400).json({ message: "Recurso duplicado" });
  }

  res.status(500).json({ message: "Error interno del servidor" });
});

const PORT = process.env.PORT || 5000;

// Solo hacer listen si no estamos en Vercel
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
}

// Exportar para Vercel - debe ser una función handler
// Vercel pasa (req, res) directamente al handler
const handler = (req, res) => {
  return app(req, res);
};

export default handler;