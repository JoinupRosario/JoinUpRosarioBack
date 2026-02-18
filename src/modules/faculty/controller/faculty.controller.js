import Faculty from "../model/faculty.model.js";
import User from "../../users/user.model.js";
import { getInfoFacultades, getFacultadesFromOSB } from "../../../services/uxxiIntegration.service.js";

/**
 * GET /faculties/compare-universitas
 * Comparación POR CÓDIGO (no por cantidad): cada facultad de Universitas (cod_facultad)
 * se busca en BD por Faculty.code. Las que están en Universitas y NO existen en BD por code
 * se devuelven en newFaculties para poder crearlas.
 * Así, aunque BD tenga más facultades que Universitas, si en Universitas hay una con código
 * que no está en BD, se ofrece crear esa.
 */
export const compareFacultiesWithUniversitas = async (req, res) => {
  try {
    let universitasList;
    try {
      universitasList = await getFacultadesFromOSB();
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: "Error al conectar con OSB (Consulta_facultades). Revisar URL_OSB, USS_URJOB y PASS_URJOB.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
    const dbCount = await Faculty.countDocuments({});
    const dbCodes = await Faculty.find({}).select("code").lean();
    const normalizeCode = (c) => String(c ?? "").trim();
    const codeSet = new Set(dbCodes.map((f) => normalizeCode(f.code)));
    const newFaculties = universitasList.filter((f) => !codeSet.has(normalizeCode(f.cod_facultad)));
    return res.json({
      success: true,
      dbCount,
      universitasCount: universitasList.length,
      newFaculties: newFaculties.map((f) => ({ cod_facultad: f.cod_facultad, nombre_facultad: f.nombre_facultad })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /faculties/create-from-universitas
 * Body: { faculties: [ { cod_facultad, nombre_facultad } ] }
 * Crea en BD con code, name y userCreator (email del usuario autenticado).
 * No hace throw: procesa todos los ítems, recoge errores y siempre responde 200 con resumen (created + errors).
 */
export const createFacultiesFromUniversitas = async (req, res) => {
  const { faculties } = req.body || {};
  if (!Array.isArray(faculties) || faculties.length === 0) {
    return res.status(400).json({ success: false, message: "Se requiere body.faculties (array no vacío)." });
  }
  const errors = [];
  let userCreatorEmail = "";
  try {
    if (req.user?.id) {
      const currentUser = await User.findById(req.user.id).select("email").lean();
      userCreatorEmail = (currentUser?.email ?? "").toString().trim();
    }
  } catch (err) {
    errors.push({ message: err.message, context: "userCreator" });
  }
  const created = [];
  for (const f of faculties) {
    try {
      const code = String(f.cod_facultad ?? f.code ?? "").trim();
      const name = (f.nombre_facultad ?? f.name ?? "").toString().trim().substring(0, 255);
      if (!code || !name) continue;
      const exists = await Faculty.findOne({ code });
      if (exists) continue;
      const faculty = await Faculty.create({
        code,
        name,
        status: "ACTIVE",
        userCreator: userCreatorEmail || undefined,
        dateCreation: new Date(),
      });
      created.push({ _id: faculty._id, code: faculty.code, name: faculty.name });
    } catch (err) {
      errors.push({
        message: err.message,
        item: `facultad ${(f.cod_facultad ?? f.code ?? "").toString().trim()} - ${(f.nombre_facultad ?? f.name ?? "").toString().trim().substring(0, 80)}`,
      });
    }
  }
  const message =
    errors.length === 0
      ? created.length
        ? `Se crearon ${created.length} facultad(es).`
        : "No se creó ninguna facultad nueva."
      : `Proceso completado con observaciones: ${created.length} facultad(es) creada(s); ${errors.length} error(es).`;
  return res.status(200).json({
    success: true,
    message,
    created,
    errors: errors.length ? errors : undefined,
  });
};

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

const isValidObjectId = (id) => /^[a-fA-F0-9]{24}$/.test(id);

export const getFacultyById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !isValidObjectId(id)) {
      return res.status(404).json({ message: "Facultad no encontrada" });
    }
    const faculty = await Faculty.findById(id)
      .populate("sucursalId", "nombre codigo")
      .populate("identificationTypeSigner", "value description")
      .populate("identificationFromSigner", "name")
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
      .populate("identificationTypeSigner", "value description")
      .populate("identificationFromSigner", "name")
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
    let userUpdaterEmail = "";
    if (req.user?.id) {
      const currentUser = await User.findById(req.user.id).select("email").lean();
      userUpdaterEmail = (currentUser?.email ?? "").toString().trim();
    }
    const updateData = {
      ...req.body,
      userUpdater: userUpdaterEmail || undefined,
      dateUpdate: new Date(),
    };
    const faculty = await Faculty.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("sucursalId", "nombre codigo")
      .populate("identificationTypeSigner", "value description")
      .populate("identificationFromSigner", "name")
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
