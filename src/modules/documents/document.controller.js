import Document from "./document.model.js";
import fs from "fs";
import path from "path";

// Obtener todos los documentos
export const getDocuments = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, category, status } = req.query;
    const filter = {};
    
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (status) filter.status = status;

    const documents = await Document.find(filter)
      .populate("uploadedBy", "name email")
      .populate("reviewedBy", "name email")
      .populate("relatedTo.student", "studentId faculty program")
      .populate("relatedTo.company", "name sector")
      .populate("relatedTo.internship")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Document.countDocuments(filter);

    res.json({
      documents,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener documentos por tipo
export const getDocumentsByType = async (req, res) => {
  try {
    const { type } = req.params;
    
    const documents = await Document.find({ type })
      .populate("uploadedBy", "name email")
      .populate("relatedTo.student", "studentId faculty program")
      .populate("relatedTo.company", "name sector")
      .sort({ createdAt: -1 });

    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener documento por ID
export const getDocumentById = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate("uploadedBy", "name email")
      .populate("reviewedBy", "name email")
      .populate("relatedTo.student", "studentId faculty program")
      .populate("relatedTo.company", "name sector")
      .populate("relatedTo.internship");

    if (!document) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Subir documento
export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se proporcionó archivo" });
    }

    const { type, category, relatedTo } = req.body;

    const document = await Document.create({
      name: req.body.name || req.file.originalname,
      type,
      category,
      file: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      relatedTo: relatedTo ? JSON.parse(relatedTo) : {},
      uploadedBy: req.user.id
    });

    await document.populate("uploadedBy", "name email");

    res.status(201).json({
      message: "Documento subido correctamente",
      document
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar documento
export const updateDocument = async (req, res) => {
  try {
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("uploadedBy", "name email");

    if (!document) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar documento
export const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    // Eliminar archivo físico
    if (document.file.path && fs.existsSync(document.file.path)) {
      fs.unlinkSync(document.file.path);
    }

    await Document.findByIdAndDelete(req.params.id);

    res.json({ message: "Documento eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Descargar documento
export const downloadDocument = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    const filePath = document.file.path;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Archivo no encontrado en el servidor" });
    }

    res.download(filePath, document.file.originalName);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Aprobar documento
export const approveDocument = async (req, res) => {
  try {
    const { comments } = req.body;
    
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      {
        status: "approved",
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        comments
      },
      { new: true, runValidators: true }
    ).populate("reviewedBy", "name email");

    if (!document) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    res.json({ 
      message: "Documento aprobado correctamente",
      document 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
