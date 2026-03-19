import mongoose from "mongoose";
import CondicionCurricular, { ACADEMIC_VARIABLES, OPERATORS } from "./condicionCurricular.model.js";
import ProgramFaculty from "../program/model/programFaculty.model.js";
import { buildSearchRegex } from "../../utils/searchUtils.js";

const MSG_DUPLICADO =
  "Ya existe otra regla con la misma parametrización (periodo, facultad, programas, condiciones, lógica y asignaturas requeridas). El nombre no cuenta: debe cambiar al menos uno de esos otros campos para poder guardar.";

/** Valor de condición comparable entre body (string) y BD (number). */
function normValorCondicion(v) {
  if (v === "" || v == null) return "";
  const n = Number(v);
  if (!Number.isNaN(n) && String(v).trim() !== "" && Number.isFinite(n)) return n;
  return String(v).trim().toLowerCase();
}

/** Huella sin nombre: misma parametrización operativa = duplicado (el nombre puede ser distinto). */
function fingerprintReglaParametros({ periodo, facultad, programas, logica, condiciones, asignaturasRequeridas }) {
  const per = String(periodo);
  const fac = String(facultad);
  const prog = [...new Set((programas || []).map((id) => String(id)))].sort().join("|");
  const log = logica || "AND";
  const condStr = [...(condiciones || [])]
    .map((c) => `${c.variable}\t${c.operador}\t${JSON.stringify(normValorCondicion(c.valor))}`)
    .sort()
    .join(";");
  const asigStr = [...(asignaturasRequeridas || [])]
    .map((a) => {
      const aid =
        a && typeof a === "object" && a.asignatura != null
          ? String(a.asignatura)
          : String(a);
      const tipo = a && typeof a === "object" ? a.tipo || "" : "";
      return `${aid}\t${tipo}`;
    })
    .sort()
    .join(";");
  return `${per}##${fac}##${prog}##${log}##${condStr}##${asigStr}`;
}

function fingerprintFromDoc(doc) {
  return fingerprintReglaParametros({
    periodo: doc.periodo,
    facultad: doc.facultad,
    programas: (doc.programas || []).map((p) => p.toString()),
    logica: doc.logica,
    condiciones: doc.condiciones || [],
    asignaturasRequeridas: (doc.asignaturasRequeridas || []).map((a) => ({
      asignatura: a.asignatura,
      tipo: a.tipo,
    })),
  });
}

function fingerprintFromBody(body) {
  return fingerprintReglaParametros({
    periodo: body.periodo,
    facultad: body.facultad,
    programas: body.programas || [],
    logica: body.logica,
    condiciones: body.condiciones || [],
    asignaturasRequeridas: body.asignaturasRequeridas || [],
  });
}

/** Busca otra regla idéntica (excluye excludeId en actualización). */
async function findReglaDuplicada(body, excludeId) {
  const periodo = body.periodo;
  const facultad = body.facultad;
  if (!periodo || !facultad || !mongoose.Types.ObjectId.isValid(String(periodo)) || !mongoose.Types.ObjectId.isValid(String(facultad))) {
    return null;
  }
  const target = fingerprintFromBody(body);
  const q = { periodo, facultad };
  if (excludeId && mongoose.Types.ObjectId.isValid(String(excludeId))) {
    q._id = { $ne: excludeId };
  }
  const candidates = await CondicionCurricular.find(q).select("periodo facultad programas logica condiciones asignaturasRequeridas").lean();
  for (const c of candidates) {
    if (fingerprintFromDoc(c) === target) return c;
  }
  return null;
}

const POPULATE_FIELDS = [
  { path: "periodo",  select: "codigo tipo estado" },
  { path: "facultad", select: "name code" },
  {
    path: "programas",
    select: "code activo programId",
    populate: { path: "programId", select: "name code level labelLevel" },
  },
  { path: "asignaturasRequeridas.asignatura", select: "nombreAsignatura codAsignatura idAsignatura" },
];

// ── Devuelve las variables y operadores disponibles (para el builder del front) ─
export const getVariablesDisponibles = (_req, res) => {
  res.json({ variables: ACADEMIC_VARIABLES, operadores: OPERATORS });
};

// ── Programas con condición curricular activa para un periodo (para formación académica en oportunidades) ─
export const getProgramasHabilitadosPorPeriodo = async (req, res) => {
  try {
    const { periodo } = req.query;
    if (!periodo) {
      return res.status(400).json({ message: "Se requiere el parámetro periodo" });
    }
    const reglas = await CondicionCurricular.find({
      periodo,
      estado: "ACTIVE",
    })
      .select("programas")
      .lean();
    const programFacultyIds = [...new Set(reglas.flatMap((r) => (r.programas || []).map((id) => id.toString())))];
    if (programFacultyIds.length === 0) {
      return res.json({ programIds: [] });
    }
    const pfs = await ProgramFaculty.find({ _id: { $in: programFacultyIds } })
      .select("programId")
      .lean();
    const programIds = [...new Set(pfs.map((pf) => pf.programId?.toString()).filter(Boolean))];
    res.json({ programIds });
  } catch (e) {
    res.status(500).json({
      message: "Error al obtener programas habilitados para el periodo",
      error: e.message,
    });
  }
};

/**
 * IDs de ProgramFaculty que aparecen en al menos una condición curricular ACTIVE.
 * - Si la regla lista programas: esos PF.
 * - Si la regla no lista programas ("todos"): todos los PF activos de esa facultad.
 * Uso: filtros UXXI (nivel/programa solo con cobertura de reglas).
 */
export const getProgramFacultyIdsEnReglasActivas = async (_req, res) => {
  try {
    const reglas = await CondicionCurricular.find({ estado: "ACTIVE" })
      .select("programas facultad")
      .lean();
    const pfIds = new Set();
    const facultyIds = [];
    for (const r of reglas) {
      const progs = r.programas || [];
      if (progs.length > 0) {
        progs.forEach((id) => pfIds.add(id.toString()));
      } else if (r.facultad) {
        facultyIds.push(r.facultad);
      }
    }
    const facUnique = [...new Set(facultyIds.map((f) => f.toString()))];
    if (facUnique.length > 0) {
      const fObjectIds = facUnique
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      if (fObjectIds.length > 0) {
        const extra = await ProgramFaculty.find({
          facultyId: { $in: fObjectIds },
          activo: "SI",
          status: "ACTIVE",
        })
          .select("_id")
          .lean();
        extra.forEach((p) => pfIds.add(p._id.toString()));
      }
    }
    res.json({ programFacultyIds: [...pfIds] });
  } catch (e) {
    res.status(500).json({
      message: "Error al obtener programas con condición curricular",
      error: e.message,
    });
  }
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
    const dup = await findReglaDuplicada(req.body, null);
    if (dup) {
      return res.status(409).json({
        message: MSG_DUPLICADO,
        code: "DUPLICADO_CONDICION_CURRICULAR",
      });
    }
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
    const existing = await CondicionCurricular.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ message: "Condición curricular no encontrada" });

    const { _id, createdAt, updatedAt, __v, ...update } = req.body;
    update.userUpdater = req.user?.email;

    const merged = {
      nombre: update.nombre !== undefined ? update.nombre : existing.nombre,
      periodo: update.periodo !== undefined ? update.periodo : existing.periodo,
      facultad: update.facultad !== undefined ? update.facultad : existing.facultad,
      programas: update.programas !== undefined ? update.programas : existing.programas,
      logica: update.logica !== undefined ? update.logica : existing.logica,
      condiciones: update.condiciones !== undefined ? update.condiciones : existing.condiciones,
      asignaturasRequeridas:
        update.asignaturasRequeridas !== undefined
          ? update.asignaturasRequeridas
          : existing.asignaturasRequeridas,
    };

    const dup = await findReglaDuplicada(merged, req.params.id);
    if (dup) {
      return res.status(409).json({
        message: MSG_DUPLICADO,
        code: "DUPLICADO_CONDICION_CURRICULAR",
      });
    }

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
