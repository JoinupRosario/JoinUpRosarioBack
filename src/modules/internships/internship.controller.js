import Internship from "./internship.model.js";
import Student from "../students/student.model.js";
import Opportunity from "../opportunities/opportunity.model.js";
import Company from "../companies/company.model.js";

// Obtener todas las pasantías
export const getInternships = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, academicPeriod } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (academicPeriod) filter.academicPeriod = academicPeriod;

    const internships = await Internship.find(filter)
      .populate("student", "studentId faculty program user")
      .populate("opportunity", "title company")
      .populate("company", "name sector")
      .populate("supervisors.academic.tutor", "name email")
      .populate("supervisors.academic.leader", "name email")
      .populate("supervisors.academic.monitor", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Internship.countDocuments(filter);

    res.json({
      internships,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener pasantía por ID
export const getInternshipById = async (req, res) => {
  try {
    const internship = await Internship.findById(req.params.id)
      .populate("student", "studentId faculty program user")
      .populate("opportunity", "title company")
      .populate("company", "name sector")
      .populate("supervisors.academic.tutor", "name email")
      .populate("supervisors.academic.leader", "name email")
      .populate("supervisors.academic.monitor", "name email");

    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    res.json(internship);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nueva pasantía
export const createInternship = async (req, res) => {
  try {
    const internship = await Internship.create(req.body);
    
    await internship.populate("student", "studentId faculty program user");
    await internship.populate("opportunity", "title company");
    await internship.populate("company", "name sector");

    res.status(201).json(internship);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar pasantía
export const updateInternship = async (req, res) => {
  try {
    const internship = await Internship.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("student", "studentId faculty program user");

    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    res.json(internship);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar pasantía
export const deleteInternship = async (req, res) => {
  try {
    const internship = await Internship.findByIdAndDelete(req.params.id);
    
    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    res.json({ message: "Pasantía eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Aprobar pasantía
export const approveInternship = async (req, res) => {
  try {
    const internship = await Internship.findByIdAndUpdate(
      req.params.id,
      {
        status: "approved",
        approvedBy: req.user.id,
        approvedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    res.json({ 
      message: "Pasantía aprobada correctamente",
      internship 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Enviar reporte mensual
export const submitReport = async (req, res) => {
  try {
    const { month, year, comments } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: "No se proporcionó archivo de reporte" });
    }

    const internship = await Internship.findById(req.params.id);
    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    // Agregar reporte
    internship.documents.reports.push({
      month: parseInt(month),
      year: parseInt(year),
      file: req.file.path,
      submittedAt: new Date(),
      comments
    });

    await internship.save();

    res.json({ message: "Reporte enviado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Enviar evaluación
export const submitEvaluation = async (req, res) => {
  try {
    const { type, score, comments } = req.body;

    const internship = await Internship.findById(req.params.id);
    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    // Agregar evaluación
    internship.documents.evaluations.push({
      type,
      score: parseFloat(score),
      comments,
      evaluatedBy: req.user.id,
      evaluatedAt: new Date()
    });

    await internship.save();

    res.json({ message: "Evaluación enviada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Registrar asistencia
export const recordAttendance = async (req, res) => {
  try {
    const { date, hours, description } = req.body;

    const internship = await Internship.findById(req.params.id);
    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    // Agregar registro de asistencia
    internship.attendance.push({
      date: new Date(date),
      hours: parseInt(hours),
      description,
      approved: false
    });

    await internship.save();

    res.json({ message: "Asistencia registrada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Registrar ausencia
export const recordAbsence = async (req, res) => {
  try {
    const { date, reason, justified, document } = req.body;

    const internship = await Internship.findById(req.params.id);
    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    // Agregar registro de ausencia
    internship.absences.push({
      date: new Date(date),
      reason,
      justified: justified === "true",
      document
    });

    await internship.save();

    res.json({ message: "Ausencia registrada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generar certificado
export const generateCertificate = async (req, res) => {
  try {
    const internship = await Internship.findById(req.params.id);
    if (!internship) {
      return res.status(404).json({ message: "Pasantía no encontrada" });
    }

    if (internship.status !== "completed") {
      return res.status(400).json({ message: "La pasantía debe estar completada para generar certificado" });
    }

    // Aquí se generaría el certificado (PDF)
    // Por ahora solo actualizamos el estado
    internship.documents.certificate = `certificates/internship_${internship._id}_${Date.now()}.pdf`;
    await internship.save();

    res.json({ 
      message: "Certificado generado correctamente",
      certificatePath: internship.documents.certificate
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
