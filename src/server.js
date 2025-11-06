import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import connectDB from "./config/db.js";
import routes from "./routes/index.js";
import { handleUploadError } from "./middlewares/upload.js";

dotenv.config();

const app = express();
connectDB();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [
      "https://app.rosario.mozartia.com",
      "https://app.rosario.mozartia.com/",
      "http://localhost:5173", 
    ],
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(helmet());
app.use(compression());

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
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
