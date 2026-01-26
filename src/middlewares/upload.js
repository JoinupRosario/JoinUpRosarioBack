import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

// Función para asegurar que el directorio existe
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = "src/uploads/";
    
    // Determinar carpeta según el tipo de archivo
    switch (file.fieldname) {
      case "cv":
        uploadPath += "cv/";
        break;
      case "logo":
        uploadPath += "logos/";
        break;
      case "profile_picture":
        uploadPath += "profile_pictures/";
        break;
      case "certificate":
        uploadPath += "certificates/";
        break;
      case "document":
        uploadPath += "attachments/";
        break;
      case "report":
        uploadPath += "reports/";
        break;
      default:
        uploadPath += "attachments/";
    }
    
    // Asegurar que el directorio existe
    ensureDirectoryExists(uploadPath);
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generar nombre único para el archivo
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Filtro de tipos de archivo permitidos
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    "cv": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    "logo": ["image/jpeg", "image/png", "image/gif"],
    "profile_picture": ["image/jpeg", "image/png", "image/gif", "image/webp"],
    "certificate": ["application/pdf", "image/jpeg", "image/png"],
    "document": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"],
    "report": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
  };

  const allowedMimeTypes = allowedTypes[file.fieldname] || allowedTypes["document"];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido para ${file.fieldname}. Tipos permitidos: ${allowedMimeTypes.join(", ")}`), false);
  }
};

// Configuración de multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB límite
    files: 1 // Un archivo por vez
  }
});

// Middleware para manejo de errores de multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "El archivo es demasiado grande. Máximo 10MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ message: "Demasiados archivos. Solo se permite uno." });
    }
  }
  
  if (error.message.includes("Tipo de archivo no permitido")) {
    return res.status(400).json({ message: error.message });
  }
  
  next(error);
};

export { upload, handleUploadError };
