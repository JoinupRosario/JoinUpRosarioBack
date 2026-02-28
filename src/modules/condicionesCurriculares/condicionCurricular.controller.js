import CondicionCurricular, { ACADEMIC_VARIABLES, OPERATORS } from "./condicionCurricular.model.js";
import { buildSearchRegex } from "../../utils/searchUtils.js";

const POPULATE_FIELDS = [
  { path: "periodo",  select: "codigo tipo estado" },
  { path: "facultad", select: "name code" },
  {
    path: "programas",
    select: "code activo programId",
    populate: { path: "programId", select: "name code level labelLevel" },
  },
  { path: "asignaturasRequeridas.asignatura", select: "nombreAsignatura codAsignatura" },
];

// ── Devuelve las variables y operadores disponibles (para el builder del front) ─
export const getVariablesDisponibles = (_req, res) => {
  res.json({ variables: ACADEMIC_VARIABLES, operadores: OPERATORS });
};

// ── Listar (paginado, con filtros) ────────────────────────────────────────────
export const getCondicionesCurriculares = async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "", estado, facultad, periodo } = req.query;
    const skip   = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};

    if (search)   filter.nombre  = buildSearchRegex(search);
    if (estado)   filter.estado  = estado;
    if (facultad) filter.facultad = facultad;
    if (periodo)  filter.periodo  = periodo;

    const [total, data] = await Promise.all([
      CondicionCurricular.countDocuments(filter),
      CondicionCurricular.find(filter)
        .populate(POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
    ]);

    res.json({
      data,
      pagination: {
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (e) {
    res.status(500).json({ message: "Error al obtener condiciones curriculares", error: e.message });
  }
};

// ── Detalle por ID ────────────────────────────────────────────────────────────
export const getCondicionCurricularById = async (req, res) => {
  try {
    const doc = await CondicionCurricular.findById(req.params.id).populate(POPULATE_FIELDS);
    if (!doc) return res.status(404).json({ message: "Condición curricular no encontrada" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: "Error al obtener condición curricular", error: e.message });
  }
};

// ── Crear ─────────────────────────────────────────────────────────────────────
export const createCondicionCurricular = async (req, res) => {
  try {
    const doc = new CondicionCurricular({
      ...req.body,
      userCreator: req.user?.email,
    });
    await doc.save();
    const populated = await CondicionCurricular.findById(doc._id).populate(POPULATE_FIELDS);
    res.status(201).json(populated);
  } catch (e) {
    res.status(500).json({ message: "Error al crear condición curricular", error: e.message });
  }
};

// ── Actualizar ────────────────────────────────────────────────────────────────
export const updateCondicionCurricular = async (req, res) => {
  try {
    const { _id, createdAt, updatedAt, __v, ...update } = req.body;
    update.userUpdater = req.user?.email;

    const doc = await CondicionCurricular.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate(POPULATE_FIELDS);

    if (!doc) return res.status(404).json({ message: "Condición curricular no encontrada" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar condición curricular", error: e.message });
  }
};

// ── Toggle estado ACTIVE / INACTIVE ──────────────────────────────────────────
export const toggleEstadoCondicion = async (req, res) => {
  try {
    const doc = await CondicionCurricular.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Condición curricular no encontrada" });

    doc.estado      = doc.estado === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    doc.userUpdater = req.user?.email;
    await doc.save();

    res.json({ message: `Condición ${doc.estado === "ACTIVE" ? "activada" : "inactivada"}`, estado: doc.estado });
  } catch (e) {
    res.status(500).json({ message: "Error al cambiar estado", error: e.message });
  }
};

// ── Eliminar ──────────────────────────────────────────────────────────────────
export const deleteCondicionCurricular = async (req, res) => {
  try {
    const doc = await CondicionCurricular.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Condición curricular no encontrada" });
    res.json({ message: "Condición curricular eliminada correctamente" });
  } catch (e) {
    res.status(500).json({ message: "Error al eliminar condición curricular", error: e.message });
  }
};
