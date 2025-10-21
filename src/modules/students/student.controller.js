import Student from "./student.model.js";
import User from "../users/user.model.js";
import Document from "../documents/document.model.js";
import path from "path";

// Obtener todos los estudiantes
export const getStudents = async (req, res) => {
  try {
    const { page = 1, limit = 10, faculty, program, status } = req.query;
    const filter = {};
    
    if (faculty) filter.faculty = faculty;
    if (program) filter.program = program;
    if (status) filter.status = status;

    const students = await Student.find(filter)
      .populate("user", "name email role")
      .populate("internship")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Student.countDocuments(filter);

    res.json({
      students,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener estudiante por ID
export const getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate("user", "name email role")
      .populate("internship")
      .populate("company", "name sector");

    if (!student) {
      return res.status(404).json({ message: "Estudiante no encontrado" });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nuevo estudiante
export const createStudent = async (req, res) => {
  try {
    const { user, ...studentData } = req.body;
    
    // Verificar que el usuario existe
    const userExists = await User.findById(user);
    if (!userExists) {
      return res.status(400).json({ message: "Usuario no encontrado" });
    }

    // Verificar que no sea ya un estudiante
    const existingStudent = await Student.findOne({ user });
    if (existingStudent) {
      return res.status(400).json({ message: "El usuario ya es un estudiante" });
    }

    const student = await Student.create({ user, ...studentData });
    await student.populate("user", "name email role");

    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar estudiante
export const updateStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("user", "name email role");

    if (!student) {
      return res.status(404).json({ message: "Estudiante no encontrado" });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar estudiante
export const deleteStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    
    if (!student) {
      return res.status(404).json({ message: "Estudiante no encontrado" });
    }

    res.json({ message: "Estudiante eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener perfil del estudiante actual
export const getStudentProfile = async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user.id })
      .populate("user", "name email role")
      .populate("internship");

    if (!student) {
      return res.status(404).json({ message: "Perfil de estudiante no encontrado" });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar perfil del estudiante
export const updateStudentProfile = async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { user: req.user.id },
      req.body,
      { new: true, runValidators: true }
    ).populate("user", "name email role");

    if (!student) {
      return res.status(404).json({ message: "Perfil de estudiante no encontrado" });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Subir CV
export const uploadCV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se proporcionó archivo" });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Estudiante no encontrado" });
    }

    // Crear registro de documento
    const document = await Document.create({
      name: `CV - ${student.user.name}`,
      type: "cv",
      category: "student",
      file: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      relatedTo: {
        student: student._id
      },
      uploadedBy: req.user.id,
      status: "approved"
    });

    // Actualizar CV en el estudiante
    student.cv = req.file.path;
    await student.save();

    res.json({ 
      message: "CV subido correctamente",
      document,
      cvPath: student.cv
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
