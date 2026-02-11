import Faculty from "../model/faculty.model.js";
import { getInfoFacultades } from "../../../services/uxxiIntegration.service.js";

/** RQ02_HU003: Sincronizar facultades desde UXXI (getInfoFacultades). Botón de integración. */
export const syncFacultiesFromUXXI = async (req, res) => {
  try {
    let list;
    try {
      list = await getInfoFacultades();
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: "Error al conectar con UXXI (getInfoFacultades). Verificar UXXI_GET_FACULTIES_URL.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
    if (list == null) {
      return res.status(200).json({
        success: false,
        message: "Integración UXXI no configurada. Definir UXXI_GET_FACULTIES_URL en .env.",
        synced: 0,
      });
    }
    let created = 0;
    let updated = 0;
    for (const f of list) {
      const existing = await Faculty.findOne({ code: f.code });
      if (existing) {
        await Faculty.updateOne(
          { _id: existing._id },
          { $set: { name: f.name, status: f.status || existing.status } }
        );
        updated++;
      } else {
        await Faculty.create({
          code: f.code,
          name: f.name,
          status: f.status || "ACTIVE",
        });
        created++;
      }
    }
    return res.status(200).json({
      success: true,
      message: "Sincronización de facultades desde UXXI completada.",
      synced: list.length,
      created,
      updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getFaculties = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { code: searchRegex },
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Faculty.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum).populate("sucursalId", "nombre codigo").lean(),
      Faculty.countDocuments(filter),
    ]);

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** RQ02_HU003: Listado de facultades activas para selector Tipo de estudio (sin paginación). */
export const getFacultiesActiveList = async (req, res) => {
  try {
    const list = await Faculty.find({ status: { $in: ["ACTIVE", "active", "1"] } })
      .sort({ name: 1 })
      .select("code name _id")
      .lean();
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFacultyById = async (req, res) => {
  try {
    const faculty = await Faculty.findById(req.params.id)
      .populate("sucursalId", "nombre codigo")
      .lean();
    if (!faculty) {
      return res.status(404).json({ message: "Facultad no encontrada" });
    }
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFacultyByFacultyId = async (req, res) => {
  try {
    const faculty = await Faculty.findOne({ facultyId: parseInt(req.params.facultyId, 10) })
      .populate("sucursalId", "nombre codigo")
      .lean();
    if (!faculty) {
      return res.status(404).json({ message: "Facultad no encontrada" });
    }
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.create(req.body);
    res.status(201).json(faculty);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate("sucursalId", "nombre codigo")
      .lean();
    if (!faculty) {
      return res.status(404).json({ message: "Facultad no encontrada" });
    }
    res.json(faculty);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteFaculty = async (req, res) => {
  try {
    const faculty = await Faculty.findByIdAndDelete(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: "Facultad no encontrada" });
    }
    res.json({ message: "Facultad eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
