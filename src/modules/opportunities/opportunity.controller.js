import Opportunity from "./opportunity.model.js";
import Company from "../companies/company.model.js";
import Student from "../students/student.model.js";

// Obtener todas las oportunidades
export const getOpportunities = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      company, 
      modality, 
      search,
      minSemester,
      programs 
    } = req.query;
    
    const filter = {};
    
    if (status) filter.status = status;
    if (company) filter.company = company;
    if (modality) filter["details.modality"] = modality;
    if (minSemester) filter["requirements.minSemester"] = { $lte: parseInt(minSemester) };
    if (programs) filter["requirements.programs"] = { $in: programs.split(",") };
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    const opportunities = await Opportunity.find(filter)
      .populate("company", "name sector logo")
      .populate("createdBy", "name email")
      .populate("applications.student", "studentId faculty program")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Opportunity.countDocuments(filter);

    res.json({
      opportunities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener oportunidad por ID
export const getOpportunityById = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("company", "name sector logo contact")
      .populate("createdBy", "name email")
      .populate("applications.student", "studentId faculty program user")
      .populate("applications.reviewedBy", "name email");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json(opportunity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nueva oportunidad
export const createOpportunity = async (req, res) => {
  try {
    const { company, ...opportunityData } = req.body;
    
    // Verificar que la empresa existe
    const companyExists = await Company.findById(company);
    if (!companyExists) {
      return res.status(400).json({ message: "Empresa no encontrada" });
    }

    const opportunity = await Opportunity.create({
      ...opportunityData,
      company,
      createdBy: req.user.id
    });

    await opportunity.populate("company", "name sector logo");

    res.status(201).json(opportunity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar oportunidad
export const updateOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("company", "name sector logo");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json(opportunity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar oportunidad
export const deleteOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findByIdAndDelete(req.params.id);
    
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json({ message: "Oportunidad eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Publicar oportunidad
export const publishOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findByIdAndUpdate(
      req.params.id,
      {
        status: "published",
        publishedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate("company", "name sector logo");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json({ 
      message: "Oportunidad publicada correctamente",
      opportunity 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Postularse a oportunidad
export const applyToOpportunity = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    
    // Verificar que la oportunidad existe
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que esté publicada
    if (opportunity.status !== "published") {
      return res.status(400).json({ message: "La oportunidad no está disponible para postulaciones" });
    }

    // Verificar que el usuario es estudiante
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(400).json({ message: "Solo los estudiantes pueden postularse" });
    }

    // Verificar que no se haya postulado antes
    const existingApplication = opportunity.applications.find(
      app => app.student.toString() === student._id.toString()
    );
    
    if (existingApplication) {
      return res.status(400).json({ message: "Ya te has postulado a esta oportunidad" });
    }

    // Agregar postulación
    opportunity.applications.push({
      student: student._id,
      appliedAt: new Date()
    });

    await opportunity.save();

    res.json({ message: "Postulación enviada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener postulaciones de una oportunidad
export const getApplications = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("applications.student", "studentId faculty program user")
      .populate("applications.reviewedBy", "name email");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json(opportunity.applications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Revisar postulación
export const reviewApplication = async (req, res) => {
  try {
    const { opportunityId, applicationId } = req.params;
    const { status, comments } = req.body;

    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const application = opportunity.applications.id(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    application.status = status;
    application.comments = comments;
    application.reviewedBy = req.user.id;
    application.reviewedAt = new Date();

    await opportunity.save();

    res.json({ message: "Postulación actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
