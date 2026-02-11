import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import routes from "./routes/index.js";
import { handleUploadError } from "./middlewares/upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Conectar a la base de datos
// En Vercel, la conexión se mantiene entre invocaciones si está configurado correctamente
if (process.env.VERCEL !== "1") {
  connectDB();
} else {
  // En Vercel, conectar de forma lazy en el primer request
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

// Configuración de CORS antes de otros middlewares
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "https://app.rosario.mozartia.com",
        "https://app.rosario.mozartia.com/",
        "https://join-up-rosario-front.vercel.app/",
        "http://localhost:5173",
        "http://localhost:5174",
      ];
      // Permitir requests sin origin (mobile apps, Postman, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("No permitido por CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Authorization"],
    optionsSuccessStatus: 200, // Para navegadores legacy
  })
);

app.use(morgan("dev"));

// Configurar Helmet para no interferir con CORS
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());

// Manejar preflight requests explícitamente (antes de las rutas)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const allowedOrigins = [
      "https://app.rosario.mozartia.com",
      "https://app.rosario.mozartia.com/",
      "http://localhost:5173",
      "http://localhost:5174",
    ];
    const origin = req.headers.origin;
    
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Max-Age", "86400"); // 24 horas
    return res.sendStatus(200);
  }
  next();
});

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
