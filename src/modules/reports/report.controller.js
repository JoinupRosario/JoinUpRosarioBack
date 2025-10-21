import Report from "./report.model.js";
import Student from "../students/student.model.js";
import Internship from "../internships/internship.model.js";
import Company from "../companies/company.model.js";
import Opportunity from "../opportunities/opportunity.model.js";

// Obtener todos los reportes
export const getReports = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status } = req.query;
    const filter = {};
    
    if (type) filter.type = type;
    if (status) filter.status = status;

    const reports = await Report.find(filter)
      .populate("generatedBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Report.countDocuments(filter);

    res.json({
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener tipos de reportes disponibles
export const getReportTypes = async (req, res) => {
  try {
    const reportTypes = [
      {
        type: "students_by_faculty",
        name: "Estudiantes por Facultad",
        description: "Reporte de estudiantes agrupados por facultad"
      },
      {
        type: "internships_by_company",
        name: "Pasantías por Empresa",
        description: "Reporte de pasantías agrupadas por empresa"
      },
      {
        type: "opportunities_by_sector",
        name: "Oportunidades por Sector",
        description: "Reporte de oportunidades agrupadas por sector"
      },
      {
        type: "evaluation_summary",
        name: "Resumen de Evaluaciones",
        description: "Reporte de evaluaciones de pasantías"
      },
      {
        type: "attendance_report",
        name: "Reporte de Asistencia",
        description: "Reporte de asistencia de estudiantes"
      },
      {
        type: "completion_rates",
        name: "Tasas de Finalización",
        description: "Reporte de tasas de finalización de pasantías"
      }
    ];

    res.json(reportTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener reporte por ID
export const getReportById = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate("generatedBy", "name email");

    if (!report) {
      return res.status(404).json({ message: "Reporte no encontrado" });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generar reporte
export const generateReport = async (req, res) => {
  try {
    const { type, filters, format = "json" } = req.body;

    // Crear registro de reporte
    const report = await Report.create({
      name: `Reporte ${type} - ${new Date().toLocaleDateString()}`,
      type,
      description: `Reporte generado el ${new Date().toLocaleDateString()}`,
      filters,
      format,
      status: "generating",
      generatedBy: req.user.id,
      parameters: req.body
    });

    // Generar datos del reporte (asíncrono)
    generateReportData(report._id, type, filters);

    res.status(201).json({
      message: "Reporte en proceso de generación",
      reportId: report._id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Función para generar datos del reporte
const generateReportData = async (reportId, type, filters) => {
  try {
    let data = {};

    switch (type) {
      case "students_by_faculty":
        data = await generateStudentsByFaculty(filters);
        break;
      case "internships_by_company":
        data = await generateInternshipsByCompany(filters);
        break;
      case "opportunities_by_sector":
        data = await generateOpportunitiesBySector(filters);
        break;
      case "evaluation_summary":
        data = await generateEvaluationSummary(filters);
        break;
      case "attendance_report":
        data = await generateAttendanceReport(filters);
        break;
      case "completion_rates":
        data = await generateCompletionRates(filters);
        break;
      default:
        data = { error: "Tipo de reporte no válido" };
    }

    // Actualizar reporte con datos generados
    await Report.findByIdAndUpdate(reportId, {
      data,
      status: "completed",
      file: {
        generatedAt: new Date()
      }
    });

  } catch (error) {
    await Report.findByIdAndUpdate(reportId, {
      status: "failed",
      data: { error: error.message }
    });
  }
};

// Funciones auxiliares para generar datos
const generateStudentsByFaculty = async (filters) => {
  const pipeline = [
    { $group: { _id: "$faculty", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];
  
  const result = await Student.aggregate(pipeline);
  return { studentsByFaculty: result };
};

const generateInternshipsByCompany = async (filters) => {
  const pipeline = [
    { $lookup: { from: "companies", localField: "company", foreignField: "_id", as: "companyInfo" } },
    { $unwind: "$companyInfo" },
    { $group: { _id: "$companyInfo.name", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];
  
  const result = await Internship.aggregate(pipeline);
  return { internshipsByCompany: result };
};

const generateOpportunitiesBySector = async (filters) => {
  const pipeline = [
    { $lookup: { from: "companies", localField: "company", foreignField: "_id", as: "companyInfo" } },
    { $unwind: "$companyInfo" },
    { $group: { _id: "$companyInfo.sector", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];
  
  const result = await Opportunity.aggregate(pipeline);
  return { opportunitiesBySector: result };
};

const generateEvaluationSummary = async (filters) => {
  const internships = await Internship.find({ "documents.evaluations": { $exists: true, $ne: [] } })
    .populate("student", "studentId faculty program")
    .populate("company", "name sector");
  
  const evaluations = internships.map(internship => ({
    student: internship.student,
    company: internship.company,
    evaluations: internship.documents.evaluations
  }));
  
  return { evaluations };
};

const generateAttendanceReport = async (filters) => {
  const internships = await Internship.find({ attendance: { $exists: true, $ne: [] } })
    .populate("student", "studentId faculty program");
  
  const attendanceData = internships.map(internship => ({
    student: internship.student,
    totalHours: internship.attendance.reduce((sum, record) => sum + record.hours, 0),
    records: internship.attendance.length
  }));
  
  return { attendanceData };
};

const generateCompletionRates = async (filters) => {
  const total = await Internship.countDocuments();
  const completed = await Internship.countDocuments({ status: "completed" });
  const active = await Internship.countDocuments({ status: "active" });
  const cancelled = await Internship.countDocuments({ status: "cancelled" });
  
  return {
    total,
    completed,
    active,
    cancelled,
    completionRate: total > 0 ? (completed / total) * 100 : 0
  };
};

// Descargar reporte
export const downloadReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({ message: "Reporte no encontrado" });
    }

    if (report.status !== "completed") {
      return res.status(400).json({ message: "El reporte aún no está listo" });
    }

    if (report.format === "json") {
      res.json(report.data);
    } else {
      // Aquí se implementaría la generación de PDF/Excel
      res.json({ message: "Descarga no implementada para este formato" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
