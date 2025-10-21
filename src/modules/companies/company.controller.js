import Company from "./company.model.js";
import Document from "../documents/document.model.js";

// Obtener todas las empresas
export const getCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, sector, search } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (sector) filter.sector = sector;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { nit: { $regex: search, $options: "i" } }
      ];
    }

    const companies = await Company.find(filter)
      .populate("approvedBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Company.countDocuments(filter);

    res.json({
      companies,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener empresa por ID
export const getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate("approvedBy", "name email");

    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.json(company);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nueva empresa
export const createCompany = async (req, res) => {
  try {
    const company = await Company.create(req.body);
    await company.populate("approvedBy", "name email");

    res.status(201).json(company);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Ya existe una empresa con este NIT" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Actualizar empresa
export const updateCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("approvedBy", "name email");

    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.json(company);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Ya existe una empresa con este NIT" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Eliminar empresa
export const deleteCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.json({ message: "Empresa eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Aprobar empresa
export const approveCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      {
        status: "active",
        approvedBy: req.user.id,
        approvedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate("approvedBy", "name email");

    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.json({ 
      message: "Empresa aprobada correctamente",
      company 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Subir logo
export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se proporcionó archivo" });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    // Crear registro de documento
    const document = await Document.create({
      name: `Logo - ${company.name}`,
      type: "other",
      category: "company",
      file: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      relatedTo: {
        company: company._id
      },
      uploadedBy: req.user.id,
      status: "approved"
    });

    // Actualizar logo en la empresa
    company.logo = req.file.path;
    await company.save();

    res.json({ 
      message: "Logo subido correctamente",
      document,
      logoPath: company.logo
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
