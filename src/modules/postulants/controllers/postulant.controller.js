import Postulant from "../models/postulants.schema.js";
import User from "../../users/user.model.js";
import PostulantStatusHistory from "../models/logs/postulantLogStatus.schema.js";
import fs from "fs";
import path from "path";



export const getPostulants = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, program } = req.query;

    const postulantFilter = {};
    if (status) postulantFilter.estate_postulant = status;

    
    const postulants = await Postulant.find(postulantFilter)
      .populate("user", "_id name email code")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    // Retornar los datos en el formato que espera el frontend
    const data = postulants.map(p => ({
        _id: p._id,
        identity_postulant: p.identity_postulant,
        estate_postulant: p.estate_postulant,
        full_profile: p.full_profile,
        updatedAt: p.updatedAt,
        user: p.user ? {
            _id: p.user._id,
            name: p.user.name || "",
            lastname: "", // El modelo User no tiene lastname
            email: p.user.email || ""
        } : null
    }));

    const total = await Postulant.countDocuments(postulantFilter);

    res.json({
        data,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createPostulant = async (req, res) => {
  try {
    const { identity_postulant, user } = req.body;

    // Si no se proporciona user, buscar por código usando identity_postulant
    let userId = user;
    if (!userId && identity_postulant) {
      const foundUser = await User.findOne({ code: identity_postulant.trim() });
      if (!foundUser) {
        return res.status(404).json({
          message: `No se encontró un usuario con código/identificación: ${identity_postulant}. Debe crear el usuario primero.`
        });
      }
      userId = foundUser._id;
    }

    if (!userId) {
      return res.status(400).json({
        message: "Se requiere un usuario. Proporcione 'user' o 'identity_postulant' para buscar el usuario."
      });
    }

    // Verificar que el usuario no tenga ya un postulante
    const postulantExists = await Postulant.findOne({
      user: userId
    });

    if (postulantExists) {
      return res.status(400).json({
        message: "Este usuario ya tiene un postulante asociado"
      });
    }

    // Crear el postulante con el userId encontrado o proporcionado
    const postulantData = {
      ...req.body,
      user: userId
    };

    const postulant = new Postulant(postulantData);
    await postulant.save();

    // Populate user para retornar datos completos
    await postulant.populate("user", "_id name email code");

    res.status(201).json(postulant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPostulantById = async (req, res) => {
  try {
    const { id } = req.params;

    // Intentar buscar por _id del postulante primero
    let postulant = await Postulant.findById(id)
      .populate("user", "name email code")
      .populate("nac_country", "name")
      .populate("nac_department", "name")
      .populate("nac_city", "name")
      .populate("residence_country", "name")
      .populate("residence_department", "name")
      .populate("residence_city", "name")
      .lean();

    // Si no se encuentra, intentar buscar por user._id
    if (!postulant) {
      postulant = await Postulant.findOne({ user: id })
        .populate("user", "name email code")
        .populate("nac_country", "name")
        .populate("nac_department", "name")
        .populate("nac_city", "name")
        .populate("residence_country", "name")
        .populate("residence_department", "name")
        .populate("residence_city", "name")
        .lean();
    }

    if (!postulant) {
      return res.status(404).json({ message: "postulant not found" });
    }

    res.json(postulant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePostulant = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; 

    const postulant = await Postulant.findById(id);

    if (!postulant) {
      return res.status(404).json({ message: "postulant not found" });
    }

    const previousStatus = postulant.estate_postulant;
    const newStatus = req.body.estate_postulant;

    Object.assign(postulant, req.body);
    await postulant.save();

    if (newStatus && previousStatus !== newStatus) {
      await PostulantStatusHistory.create({
        postulant: postulant._id,
        status_before: previousStatus,
        status_after: newStatus,
        reason: req.body.reason || null,
        changed_by: userId,
        user_type: req.user.role
      });
    }

    res.json(postulant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Calcular porcentaje de completitud de perfil
function calculateCompleteness(postulant) {
  const fields = [
    postulant.identity_postulant,
    postulant.gender_postulant,
    postulant.date_nac_postulant,
    postulant.country_residencia_postulant,
    postulant.years_exp
  ];

  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}

// Subir foto de perfil
export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se proporcionó archivo" });
    }

    const { id } = req.params;
    const postulant = await Postulant.findById(id);

    if (!postulant) {
      return res.status(404).json({ message: "Postulante no encontrado" });
    }

    // Si ya existe una foto de perfil, eliminar el archivo anterior
    if (postulant.profile_picture) {
      // Construir la ruta completa del archivo anterior
      // Si la ruta guardada no tiene src/, agregarlo para encontrar el archivo
      const oldPath = postulant.profile_picture.startsWith('src/') 
        ? postulant.profile_picture 
        : `src/${postulant.profile_picture}`;
      const filePath = path.resolve(oldPath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error("Error al eliminar foto anterior:", err);
        }
      }
    }

    // Actualizar la ruta de la foto de perfil
    // Guardar la ruta sin el prefijo "src/" para que coincida con la ruta estática
    const imagePath = req.file.path.replace(/^src\//, '');
    postulant.profile_picture = imagePath;
    await postulant.save();

    res.json({
      message: "Foto de perfil subida correctamente",
      profile_picture: postulant.profile_picture
    });
  } catch (error) {
    console.error("Error en uploadProfilePicture:", error);
    res.status(500).json({ 
      message: error.message || "Error interno del servidor al subir la foto",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};