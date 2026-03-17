import mongoose from "mongoose";
import OportunidadMTM from "./oportunidadMTM.model.js";
import PostulacionMTM from "./postulacionMTM.model.js";
import LegalizacionMTM from "./legalizacionMTM.model.js";
import PlanDeTrabajoMTM from "./planDeTrabajoMTM.model.js";
import { uploadToS3, getSignedDownloadUrl, deleteFromS3 } from "../../config/s3.config.js";
import Item from "../shared/reference-data/models/item.schema.js"; // asegura registro del modelo "items"
import { buildSearchRegex } from "../../utils/searchUtils.js";
import Postulant from "../postulants/models/postulants.schema.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram, ProfileSkill, ProfileCv, ProfileSupport } from "../postulants/models/profile/index.js";
import { consultaInfAcademica, consultaAsignatura } from "../../services/uxxiIntegration.service.js";

/** Suma N días hábiles (lun–vie) a una fecha. */
function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

const POPULATE_FIELDS = [
  { path: "dedicacionHoras", select: "value description listId" },
  { path: "valorPorHora", select: "value description listId" },
  { path: "tipoVinculacion", select: "value description listId" },
  { path: "categoria", select: "value description listId" },
  { path: "periodo", select: "codigo tipo estado" },
  { path: "asignaturas", select: "nombreAsignatura codAsignatura periodo codDepto nombreDepartamento" },
  { path: "programas", select: "name code level labelLevel" },
  { path: "profesorResponsable", select: "nombres apellidos identificacion", populate: { path: "user", select: "email name" } },
  { path: "company", select: "name legalName nit" },
  { path: "creadoPor", select: "name email" },
  { path: "actualizadoPor", select: "name email" },
  { path: "cerradoPor", select: "name email" },
  { path: "historialEstados.cambiadoPor", select: "name email" },
  { path: "cierrePostulantesSeleccionados", populate: { path: "postulant", populate: { path: "postulantId", select: "name" } } },
];

// ─── Listar oportunidades MTM ─────────────────────────────────────────────────
export const getOportunidadesMTM = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      estado,
      periodo,
      categoria
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};

    if (search) {
      filter.nombreCargo = buildSearchRegex(search);
    }
    if (estado) filter.estado = estado;
    if (periodo) filter.periodo = periodo;
    if (categoria) filter.categoria = categoria;

    const [total, data] = await Promise.all([
      OportunidadMTM.countDocuments(filter),
      OportunidadMTM.find(filter)
        .populate(POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean()
    ]);

    const opIds = data.map((o) => o._id);
    const countsFromPost = await PostulacionMTM.aggregate([
      { $match: { oportunidadMTM: { $in: opIds } } },
      { $group: { _id: "$oportunidadMTM", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(countsFromPost.map((c) => [c._id.toString(), c.count]));
    const dataWithCount = data.map((opp) => ({
      ...opp,
      aplicacionesCount: countMap.get(opp._id.toString()) || 0,
    }));

    res.json({
      data: dataWithCount,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("[MTM] getOportunidadesMTM:", err);
    res.status(500).json({ message: "Error al obtener oportunidades MTM" });
  }
};

// ─── Obtener una oportunidad MTM por ID ───────────────────────────────────────
export const getOportunidadMTMById = async (req, res) => {
  try {
    const op = await OportunidadMTM.findById(req.params.id).populate(POPULATE_FIELDS).lean();
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    res.json(op);
  } catch (err) {
    console.error("[MTM] getOportunidadMTMById:", err);
    res.status(500).json({ message: "Error al obtener la oportunidad MTM" });
  }
};

// ─── Crear oportunidad MTM ────────────────────────────────────────────────────
export const createOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      company,
      nombreCargo,
      dedicacionHoras,
      valorPorHora,
      tipoVinculacion,
      categoria,
      periodo,
      vacantes,
      fechaVencimiento,
      asignaturas,
      promedioMinimo,
      profesorResponsable,
      nombreProfesor,
      unidadAcademica,
      horario,
      grupo,
      programas,
      funciones,
      requisitos
    } = req.body;

    if (!nombreCargo) {
      return res.status(400).json({ message: "El nombre del cargo es requerido" });
    }
    if (asignaturas && asignaturas.length > 3) {
      return res.status(400).json({ message: "Se pueden seleccionar máximo 3 asignaturas" });
    }

    const nueva = await OportunidadMTM.create({
      company: company || null,
      nombreCargo,
      dedicacionHoras: dedicacionHoras || null,
      valorPorHora: valorPorHora || null,
      tipoVinculacion: tipoVinculacion || null,
      categoria: categoria || null,
      periodo: periodo || null,
      vacantes: vacantes || null,
      fechaVencimiento: fechaVencimiento || null,
      asignaturas: asignaturas || [],
      promedioMinimo: promedioMinimo ?? null,
      profesorResponsable: profesorResponsable || null,
      nombreProfesor: nombreProfesor || null,
      unidadAcademica: unidadAcademica || null,
      horario: horario || null,
      grupo: grupo || null,
      programas: programas || [],
      funciones: funciones || null,
      requisitos: requisitos || null,
      estado: "Borrador",
      creadoPor: userId || null,
      historialEstados: [
        {
          estadoAnterior: null,
          estadoNuevo: "Borrador",
          cambiadoPor: userId,
          motivo: "Creación"
        }
      ]
    });

    const populated = await nueva.populate(POPULATE_FIELDS);
    res.status(201).json(populated);
  } catch (err) {
    console.error("[MTM] createOportunidadMTM:", err);
    res.status(500).json({ message: "Error al crear la oportunidad MTM" });
  }
};

// ─── Actualizar oportunidad MTM ───────────────────────────────────────────────
export const updateOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const op = await OportunidadMTM.findById(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const {
      company,
      nombreCargo,
      dedicacionHoras,
      valorPorHora,
      tipoVinculacion,
      categoria,
      periodo,
      vacantes,
      fechaVencimiento,
      asignaturas,
      promedioMinimo,
      profesorResponsable,
      nombreProfesor,
      unidadAcademica,
      horario,
      grupo,
      programas,
      funciones,
      requisitos
    } = req.body;

    if (asignaturas && asignaturas.length > 3) {
      return res.status(400).json({ message: "Se pueden seleccionar máximo 3 asignaturas" });
    }

    Object.assign(op, {
      ...(company !== undefined && { company }),
      ...(nombreCargo !== undefined && { nombreCargo }),
      ...(dedicacionHoras !== undefined && { dedicacionHoras }),
      ...(valorPorHora !== undefined && { valorPorHora }),
      ...(tipoVinculacion !== undefined && { tipoVinculacion }),
      ...(categoria !== undefined && { categoria }),
      ...(periodo !== undefined && { periodo }),
      ...(vacantes !== undefined && { vacantes }),
      ...(fechaVencimiento !== undefined && { fechaVencimiento }),
      ...(asignaturas !== undefined && { asignaturas }),
      ...(promedioMinimo !== undefined && { promedioMinimo }),
      ...(profesorResponsable !== undefined && { profesorResponsable: profesorResponsable || null }),
      ...(nombreProfesor !== undefined && { nombreProfesor }),
      ...(unidadAcademica !== undefined && { unidadAcademica }),
      ...(horario !== undefined && { horario }),
      ...(grupo !== undefined && { grupo }),
      ...(programas !== undefined && { programas }),
      ...(funciones !== undefined && { funciones }),
      ...(requisitos !== undefined && { requisitos }),
      actualizadoPor: userId || null
    });

    op.historialEstados = op.historialEstados || [];
    op.historialEstados.push({
      estadoAnterior: op.estado,
      estadoNuevo: op.estado,
      cambiadoPor: userId,
      motivo: "Edición de datos",
    });

    await op.save();
    const populated = await op.populate(POPULATE_FIELDS);
    res.json(populated);
  } catch (err) {
    console.error("[MTM] updateOportunidadMTM:", err);
    res.status(500).json({ message: "Error al actualizar la oportunidad MTM" });
  }
};

// ─── Cambiar estado de oportunidad MTM ───────────────────────────────────────
export const changeStatusMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { estado, motivo } = req.body;

    const VALID_STATES = ["Borrador", "Activa", "Inactiva"];
    if (!VALID_STATES.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const op = await OportunidadMTM.findById(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    op.historialEstados.push({
      estadoAnterior: op.estado,
      estadoNuevo: estado,
      cambiadoPor: userId,
      motivo: motivo || null
    });
    op.estado = estado;
    op.actualizadoPor = userId || null;
    await op.save();

    const populated = await op.populate(POPULATE_FIELDS);
    res.json(populated);
  } catch (err) {
    console.error("[MTM] changeStatusMTM:", err);
    res.status(500).json({ message: "Error al cambiar el estado" });
  }
};

// ─── Duplicar oportunidad MTM ─────────────────────────────────────────────────
export const duplicateOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const original = await OportunidadMTM.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const { _id, createdAt, updatedAt, historialEstados, __v, ...rest } = original;

    const copia = await OportunidadMTM.create({
      ...rest,
      nombreCargo: `${rest.nombreCargo} (copia)`,
      estado: "Borrador",
      creadoPor: userId || null,
      actualizadoPor: null,
      historialEstados: [
        {
          estadoAnterior: null,
          estadoNuevo: "Borrador",
          cambiadoPor: userId,
          motivo: `Duplicado desde ${_id}`
        }
      ]
    });

    const populated = await copia.populate(POPULATE_FIELDS);
    res.status(201).json(populated);
  } catch (err) {
    console.error("[MTM] duplicateOportunidadMTM:", err);
    res.status(500).json({ message: "Error al duplicar la oportunidad MTM" });
  }
};

// ─── Eliminar oportunidad MTM ─────────────────────────────────────────────────
export const deleteOportunidadMTM = async (req, res) => {
  try {
    const op = await OportunidadMTM.findByIdAndDelete(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    res.json({ message: "Oportunidad MTM eliminada correctamente" });
  } catch (err) {
    console.error("[MTM] deleteOportunidadMTM:", err);
    res.status(500).json({ message: "Error al eliminar la oportunidad MTM" });
  }
};

// ─── Helper: documento del postulante (studentCode) para UXXI ─────────────────
async function getDocumentoForPostulant(postulantId) {
  const ids = [postulantId].filter(Boolean);
  if (ids.length === 0) return null;
  const profile = await PostulantProfile.findOne({ postulantId: { $in: ids } })
    .select("studentCode")
    .sort({ updatedAt: -1 })
    .lean();
  const doc = profile?.studentCode != null && profile.studentCode !== "" ? String(profile.studentCode).trim() : "";
  return doc || null;
}

// ─── GET /oportunidades-mtm/para-estudiante ──────────────────────────────────
// RQ04_HU001: Oportunidades MTM activas que el estudiante puede ver (programa, promedio, asignaturas desde UXXI).
export const getOportunidadesMTMParaEstudiante = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) {
      return res.json({ opportunities: [], totalPages: 0, currentPage: 1, total: 0 });
    }

    const documento = await getDocumentoForPostulant(postulant._id) || await getDocumentoForPostulant(userId);
    if (!documento) {
      return res.status(400).json({
        message: "Debe tener un perfil con código estudiantil (studentCode) para ver oportunidades de monitoría.",
        opportunities: [],
        totalPages: 0,
        currentPage: 1,
        total: 0,
      });
    }

    let uxxiPlanes;
    try {
      uxxiPlanes = await consultaInfAcademica(documento);
    } catch (err) {
      console.error("[MTM] consultaInfAcademica:", err);
      return res.status(502).json({
        message: err.message || "Error al consultar información académica (UXXI).",
        opportunities: [],
        totalPages: 0,
        currentPage: 1,
        total: 0,
      });
    }

    if (!Array.isArray(uxxiPlanes) || uxxiPlanes.length === 0) {
      return res.json({ opportunities: [], totalPages: 0, currentPage: 1, total: 0 });
    }

    const studentProgramCodes = new Set();
    const studentPromedioByPlan = {};
    for (const p of uxxiPlanes) {
      const code = (p.codigoplan ?? p.planestudio ?? "").toString().trim();
      if (code) studentProgramCodes.add(code);
      const prom = p.promedioacumulado != null ? parseFloat(String(p.promedioacumulado).replace(",", ".")) : NaN;
      if (code && !Number.isNaN(prom)) studentPromedioByPlan[code] = prom;
    }

    const studentAsignaturasByPlan = {};
    for (const plan of uxxiPlanes) {
      const code = (plan.codigoplan ?? plan.planestudio ?? "").toString().trim();
      if (!code) continue;
      try {
        const items = await consultaAsignatura(documento, code);
        const codigos = new Set();
        (items || []).forEach((it) => {
          const id = it.identificador_asignatura != null ? String(it.identificador_asignatura).trim() : "";
          const cod = it.codigo_asignatura != null ? String(it.codigo_asignatura).trim() : "";
          if (id) codigos.add(id);
          if (cod) codigos.add(cod);
        });
        studentAsignaturasByPlan[code] = codigos;
      } catch {
        studentAsignaturasByPlan[code] = new Set();
      }
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const activas = await OportunidadMTM.find({ estado: "Activa" })
      .populate(POPULATE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    const yaAplicados = await PostulacionMTM.find({ postulant: postulant._id }).select("oportunidadMTM").lean();
    const idsAplicados = new Set(yaAplicados.map((p) => String(p.oportunidadMTM)).filter((id) => id.length === 24));

    const parseNum = (v) => {
      if (v == null || v === "") return NaN;
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    };

    const filtered = activas.filter((opp) => {
      if (idsAplicados.has(String(opp._id))) return false;

      const oppProgramIds = (opp.programas || []).map((p) => (p && (p._id || p))).filter(Boolean);
      const oppProgramCodes = (opp.programas || []).map((p) => (p && (p.code || p.name || "")).toString().trim()).filter(Boolean);
      const matchProgram = [...studentProgramCodes].some((sc) =>
        oppProgramCodes.some((pc) => pc === sc || (sc && pc && (pc.includes(sc) || sc.includes(pc))))
      );
      if (!matchProgram) return false;

      const minProm = parseNum(opp.promedioMinimo);
      if (!Number.isNaN(minProm)) {
        const proms = [...studentProgramCodes].map((c) => studentPromedioByPlan[c]).filter((p) => p != null && !Number.isNaN(p));
        const studentProm = proms.length ? Math.max(...proms) : null;
        if (studentProm == null || studentProm < minProm) return false;
      }

      const oppAsignaturas = opp.asignaturas || [];
      if (oppAsignaturas.length > 0) {
        const allPlansAsig = Object.values(studentAsignaturasByPlan);
        const studentAllCodigos = new Set();
        allPlansAsig.forEach((s) => s.forEach((c) => studentAllCodigos.add(c)));
        const oppCodes = oppAsignaturas.map((a) => (a && (a.codAsignatura || a.idAsignatura || a._id)).toString().trim()).filter(Boolean);
        const todasCursadas = oppCodes.every((cod) => studentAllCodigos.has(cod) || [...studentAllCodigos].some((s) => s.includes(cod) || cod.includes(s)));
        if (!todasCursadas) return false;
      }

      return true;
    });

    const total = filtered.length;
    const opportunities = filtered.slice(skip, skip + limit);

    res.json({
      opportunities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (err) {
    console.error("[MTM] getOportunidadesMTMParaEstudiante:", err);
    res.status(500).json({ message: "Error al obtener oportunidades MTM para estudiante", error: err.message });
  }
};

// ─── POST /oportunidades-mtm/:id/aplicar ─────────────────────────────────────
export const aplicarOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.status(403).json({ message: "No se encontró postulante asociado al usuario" });

    const { id } = req.params;
    const { postulantProfileId, profileVersionId } = req.body || {};

    if (!postulantProfileId) {
      return res.status(400).json({ message: "Debe indicar el perfil (hoja de vida) con el que aplica (postulantProfileId)." });
    }

    const oportunidad = await OportunidadMTM.findById(id).lean();
    if (!oportunidad) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    if (oportunidad.estado !== "Activa") {
      return res.status(400).json({ message: "Solo se puede aplicar a oportunidades en estado Activa." });
    }

    const profileDoc = await PostulantProfile.findOne({
      _id: postulantProfileId,
      postulantId: { $in: [postulant._id, userId] },
    }).select("_id").lean();
    if (!profileDoc) return res.status(400).json({ message: "Perfil no encontrado o no pertenece al postulante." });

    const existe = await PostulacionMTM.findOne({ postulant: postulant._id, oportunidadMTM: id }).lean();
    if (existe) return res.status(400).json({ message: "Ya ha aplicado a esta oportunidad." });

    const nueva = await PostulacionMTM.create({
      postulant: postulant._id,
      oportunidadMTM: id,
      postulantProfile: profileDoc._id,
      profileVersionId: profileVersionId || null,
      estado: "aplicado",
    });

    const populated = await PostulacionMTM.findById(nueva._id)
      .populate("oportunidadMTM", "nombreCargo estado")
      .populate("postulantProfile", "studentCode")
      .lean();

    res.status(201).json({ message: "Postulación registrada correctamente", postulacion: populated });
  } catch (err) {
    console.error("[MTM] aplicarOportunidadMTM:", err);
    res.status(500).json({ message: err.response?.data?.message || err.message || "Error al aplicar" });
  }
};

// ─── GET /oportunidades-mtm/mis-postulaciones ─────────────────────────────────
export const getMisPostulacionesMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.json({ data: [], total: 0 });

    const list = await PostulacionMTM.find({ postulant: postulant._id })
      .populate({
        path: "oportunidadMTM",
        select: "nombreCargo estado fechaVencimiento",
      })
      .populate("postulantProfile", "studentCode")
      .sort({ fechaAplicacion: -1 })
      .lean();

    let diasHabiles = 8;
    try {
      const Parameter = (await import("../parameters/parameter.model.js")).default;
      const param = await Parameter.findOne({ code: "DIAS_HABILES_ACEPTAR_SELECCION_MTM", "metadata.active": true }).lean();
      if (param != null && typeof param.value === "number" && param.value > 0) diasHabiles = param.value;
    } catch (_) {}

    const data = list.map((p) => {
      const opp = p.oportunidadMTM;
      return {
        _id: p._id,
        cargo: opp?.nombreCargo,
        fechaAplicacion: p.fechaAplicacion,
        tipoOportunidad: "Monitoría / Tutoría / Mentoría",
        estadoOportunidad: opp?.estado,
        estado: p.estado,
        empresaConsultoPerfil: !!p.empresaConsultoPerfilAt,
        empresaDescargoHv: !!p.empresaDescargoHvAt,
        seleccionado: p.estado === "seleccionado_empresa" || p.estado === "aceptado_estudiante",
        estadoConfirmacion: p.estadoConfirmacion,
        oportunidadId: opp?._id,
        seleccionadoAt: p.seleccionadoAt,
      };
    });

    res.json({ data, total: data.length, diasHabilesAceptarSeleccion: diasHabiles });
  } catch (err) {
    console.error("[MTM] getMisPostulacionesMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/mis-aceptadas ───────────────────────────────────
// RQ04_HU004: Lista de MTM que el estudiante aceptó (para Legalización). Solo estado aceptado_estudiante.
export const getMisAceptadasMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId })
      .select("_id postulantId")
      .populate("postulantId", "name")
      .lean();
    if (!postulant) return res.json({ data: [], total: 0 });

    const list = await PostulacionMTM.find({
      postulant: postulant._id,
      estado: "aceptado_estudiante",
    })
      .populate({
        path: "oportunidadMTM",
        select: "nombreCargo periodo nombreProfesor profesorResponsable categoria vacantes valorPorHora asignaturas programas",
        populate: [
          { path: "periodo", select: "codigo" },
          { path: "valorPorHora", select: "value description" },
          { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
          { path: "programas", select: "name code" },
          { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
        ],
      })
      .populate("postulantProfile", "studentCode")
      .sort({ aceptadoEstudianteAt: -1 })
      .lean();

    const postulacionIds = list.map((p) => p._id);
    const legalizaciones = await LegalizacionMTM.find({ postulacionMTM: { $in: postulacionIds } })
      .select("postulacionMTM estado")
      .lean();
    const estadoLegByPost = {};
    legalizaciones.forEach((l) => {
      estadoLegByPost[String(l.postulacionMTM)] = l.estado;
    });

    const nombreCompleto = postulant.postulantId?.name || "";

    const data = list.map((p) => {
      const opp = p.oportunidadMTM;
      const programaOportunidad = opp?.programas?.length
        ? opp.programas.map((prog) => prog?.name).filter(Boolean).join(", ") || opp.programas[0]?.name
        : null;
      return {
        _id: p._id,
        oportunidadId: opp?._id,
        numeroIdentidad: p.postulantProfile?.studentCode ?? null,
        nombre: nombreCompleto.split(" ").slice(0, -1).join(" ") || nombreCompleto,
        apellido: nombreCompleto.split(" ").slice(-1)[0] || "",
        programa: programaOportunidad,
        codigoMonitoria: opp?._id?.toString?.()?.slice(-8) ?? null,
        nombreMonitoria: opp?.nombreCargo ?? null,
        periodo: opp?.periodo?.codigo ?? null,
        coordinador: opp?.profesorResponsable ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ") : (opp?.nombreProfesor ?? null),
        estado: "Aceptado",
        estadoLegalizacion: estadoLegByPost[String(p._id)] === "en_revision" ? "En revisión" : estadoLegByPost[String(p._id)] === "aprobada" ? "Aprobada" : estadoLegByPost[String(p._id)] === "rechazada" ? "Rechazada" : "Pendiente",
        finalizadoPorMonitor: null,
        aceptadoEstudianteAt: p.aceptadoEstudianteAt,
        oportunidad: opp,
      };
    });

    res.json({ data, total: data.length });
  } catch (err) {
    console.error("[MTM] getMisAceptadasMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /oportunidades-mtm/:id/cerrar ─────────────────────────────────────
// RQ04_HU001: Al cerrar la oportunidad, seleccionados → estadoConfirmacion confirmado; resto → rechazado.
export const cerrarOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { postulantesSeleccionados } = req.body || {};
    const selectedIds = Array.isArray(postulantesSeleccionados) ? postulantesSeleccionados.map(String).filter(Boolean) : [];

    const op = await OportunidadMTM.findById(id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    if (op.estado !== "Activa") {
      return res.status(400).json({ message: "Solo se puede cerrar una oportunidad en estado Activa." });
    }

    const postulaciones = await PostulacionMTM.find({ oportunidadMTM: id }).lean();
    const now = new Date();
    for (const p of postulaciones) {
      const idStr = String(p._id);
      const fueSeleccionado = selectedIds.includes(idStr);
      await PostulacionMTM.updateOne(
        { _id: p._id },
        {
          $set: {
            estado: fueSeleccionado ? "seleccionado_empresa" : "rechazado",
            estadoConfirmacion: fueSeleccionado ? "confirmado" : "rechazado",
            ...(fueSeleccionado ? { seleccionadoAt: now } : { rechazadoAt: now }),
          },
        }
      );
    }

    // Trazabilidad en la oportunidad (igual que en prácticas)
    op.fechaCierre = now;
    op.cerradoPor = userId || null;
    op.cierrePostulantesSeleccionados = selectedIds
      .map((sid) => (mongoose.Types.ObjectId.isValid(sid) ? new mongoose.Types.ObjectId(sid) : null))
      .filter(Boolean);
    op.historialEstados.push({
      estadoAnterior: op.estado,
      estadoNuevo: "Inactiva",
      cambiadoPor: userId,
      motivo: selectedIds.length > 0
        ? "Cierre de oportunidad con postulante(s) seleccionado(s)"
        : "Cierre de oportunidad",
    });
    op.estado = "Inactiva";
    op.actualizadoPor = userId || null;
    await op.save();

    const populated = await OportunidadMTM.findById(id).populate(POPULATE_FIELDS).lean();
    res.json(populated);
  } catch (err) {
    console.error("[MTM] cerrarOportunidadMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/:id/applications ─────────────────────────────────
// Lista postulaciones para la coordinación (misma forma que prácticas para el front).
export const getApplicationsMTM = async (req, res) => {
  try {
    const { id } = req.params;
    const op = await OportunidadMTM.findById(id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const postulantesList = await PostulacionMTM.find({ oportunidadMTM: id })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    const profileIds = postulantesList.map((p) => p.postulantProfile?._id).filter(Boolean);
    const [enrolledByProfile, graduateByProfile] = await Promise.all([
      profileIds.length
        ? ProfileEnrolledProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
      profileIds.length
        ? ProfileGraduateProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
    ]);
    const enrolledMap = new Map();
    enrolledByProfile.forEach((e) => {
      if (!e.profileId) return;
      const key = e.profileId.toString();
      if (!enrolledMap.has(key)) enrolledMap.set(key, []);
      enrolledMap.get(key).push(e.programId?.name || e.programId?.level || "—");
    });
    const graduateMap = new Map();
    graduateByProfile.forEach((g) => {
      if (!g.profileId) return;
      const key = g.profileId.toString();
      if (!graduateMap.has(key)) graduateMap.set(key, []);
      graduateMap.get(key).push(g.programId?.name || g.programId?.level || "—");
    });

    const estadoLabel = (est) => {
      const map = {
        aplicado: "Enviado",
        empresa_consulto_perfil: "Revisado",
        empresa_descargo_hv: "HV descargada",
        seleccionado_empresa: "Seleccionado",
        aceptado_estudiante: "Aceptado",
        rechazado: "Rechazado",
      };
      return map[est] || est || "—";
    };

    const postulaciones = postulantesList.map((p) => {
      const profileId = p.postulantProfile?._id?.toString();
      const name = (p.postulant?.postulantId?.name || p.postulant?.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      const years = p.postulantProfile?.yearsExperience ?? p.postulantProfile?.totalTimeExperience;
      const añosExperiencia = years != null ? `${years} Año(s) de experiencia` : null;
      return {
        _id: p._id,
        postulant: p.postulant,
        postulantProfile: p.postulantProfile,
        fechaPostulacion: p.fechaAplicacion,
        estado: p.estado,
        estadoLabel: estadoLabel(p.estado),
        comentarios: p.comentarios,
        revisadoPor: p.revisadoPor,
        fechaRevision: p.updatedAt,
        _source: "postulacion_oportunidad",
        tipo: "postulant",
        nombres: nombres || "—",
        apellidos,
        programasEnCurso: profileId ? enrolledMap.get(profileId) || [] : [],
        programasFinalizados: profileId ? graduateMap.get(profileId) || [] : [],
        añosExperiencia,
        revisada: !!p.empresaConsultoPerfilAt,
        descargada: !!p.empresaDescargoHvAt,
      };
    });

    res.json({ postulaciones, total: postulaciones.length });
  } catch (err) {
    console.error("[MTM] getApplicationsMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/:id/applications/detail/:postulacionId ───────────
// Detalle de un postulante (perfil, HV). Al abrir se marca empresa_consulto_perfil.
export const getApplicationDetailMTM = async (req, res) => {
  try {
    const { id: oportunidadId, postulacionId } = req.params;
    const op = await OportunidadMTM.findById(oportunidadId);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
    })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    if (po.estado === "aplicado" && !po.empresaConsultoPerfilAt) {
      await PostulacionMTM.updateOne(
        { _id: postulacionId },
        {
          $set: {
            estado: "empresa_consulto_perfil",
            empresaConsultoPerfilAt: new Date(),
          },
        }
      );
    }

    const profileIdRaw = po.postulantProfile?._id ?? po.postulantProfile;
    const profileId = profileIdRaw
      ? mongoose.Types.ObjectId.isValid(profileIdRaw)
        ? typeof profileIdRaw === "string"
          ? new mongoose.Types.ObjectId(profileIdRaw)
          : profileIdRaw
        : null
      : null;
    const profileVersionIdRaw = po.profileVersionId;
    const profileVersionId = profileVersionIdRaw && mongoose.Types.ObjectId.isValid(profileVersionIdRaw)
      ? (typeof profileVersionIdRaw === "string" ? new mongoose.Types.ObjectId(profileVersionIdRaw) : profileVersionIdRaw)
      : null;
    // Solo la HV con la que aplicó: mismo perfil y misma versión (si aplicó con versión).
    const cvFilter = { profileId };
    if (profileVersionId) {
      cvFilter.profileVersionId = profileVersionId;
    } else {
      cvFilter.$or = [{ profileVersionId: null }, { profileVersionId: { $exists: false } }];
    }
    const postulantDocId = po.postulant?._id?.toString();
    const postulantDoc = postulantDocId
      ? await Postulant.findById(postulantDocId).select("_id phone alternateEmail linkedinLink").lean()
      : null;

    let cvs = [];
    if (profileId) {
      cvs = await ProfileCv.find(cvFilter)
        .populate("attachmentId", "name filepath contentType")
        .sort({ _id: -1 })
        .limit(1)
        .lean();
      // Si aplicó con perfil base (sin versión) y no hay HV con profileVersionId null, usar la más reciente del perfil.
      if (cvs.length === 0 && !profileVersionId) {
        const fallback = await ProfileCv.find({ profileId }).populate("attachmentId", "name filepath contentType").sort({ _id: -1 }).limit(1).lean();
        if (fallback.length > 0) cvs = fallback;
      }
    }
    const [skills, enrolledList, graduateList] = await Promise.all([
      profileId ? ProfileSkill.find({ profileId }).populate("skillId", "name").lean() : [],
      profileId ? ProfileEnrolledProgram.find({ profileId }).populate("programId", "name level").lean() : [],
      profileId ? ProfileGraduateProgram.find({ profileId }).populate("programId", "name level").lean() : [],
    ]);

    const name = (po.postulant?.postulantId?.name || po.postulant?.name || "").trim();
    const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
    const apellidos = rest.join(" ") || "—";
    const years = po.postulantProfile?.yearsExperience ?? po.postulantProfile?.totalTimeExperience;
    const añosExperiencia = years != null ? `${years} Año(s) de experiencia` : null;
    const estadoLabels = {
      aplicado: "Enviado",
      empresa_consulto_perfil: "Revisado",
      empresa_descargo_hv: "HV descargada",
      seleccionado_empresa: "Seleccionado",
      aceptado_estudiante: "Aceptado",
      rechazado: "Rechazado",
    };

    res.json({
      _id: po._id,
      _source: "postulacion_oportunidad",
      nombres: nombres || "—",
      apellidos,
      email: po.postulant?.postulantId?.email || postulantDoc?.alternateEmail || "—",
      telefono: postulantDoc?.phone || "—",
      linkedin: postulantDoc?.linkedinLink || null,
      fechaAplicacion: po.fechaAplicacion,
      estado: po.estado,
      estadoLabel: estadoLabels[po.estado] || po.estado,
      programasEnCurso: enrolledList.map((e) => e.programId?.name || e.programId?.level || "—"),
      programasFinalizados: graduateList.map((g) => g.programId?.name || g.programId?.level || "—"),
      añosExperiencia,
      competencias: skills.map((s) => s.skillId?.name).filter(Boolean),
      hojasDeVida: cvs.map((c) => ({
        attachmentId: c.attachmentId?._id,
        name: c.attachmentId?.name || "Hoja de vida",
        postulantDocId: postulantDocId || postulantDoc?._id?.toString(),
      })),
    });
  } catch (err) {
    console.error("[MTM] getApplicationDetailMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /oportunidades-mtm/:id/applications/:postulacionId/descargo-hv ─────
// Marca que se descargó la HV (empresaDescargoHvAt, estado empresa_descargo_hv).
export const markApplicationDescargoHvMTM = async (req, res) => {
  try {
    const { id: oportunidadId, postulacionId } = req.params;
    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    po.empresaDescargoHvAt = new Date();
    if (po.estado !== "empresa_descargo_hv") {
      po.estado = "empresa_descargo_hv";
    }
    await po.save();
    res.json({
      message: "HV marcada como descargada",
      empresaDescargoHvAt: po.empresaDescargoHvAt,
      estado: po.estado,
      estadoLabel: "HV descargada",
    });
  } catch (err) {
    console.error("[MTM] markApplicationDescargoHvMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /oportunidades-mtm/:id/applications/:postulacionId/estudiante-responder ─
// El estudiante (postulante) confirma o rechaza la selección. Body: { accion: 'confirmar' | 'rechazar' }
export const estudianteResponderPostulacionMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    const { id: oportunidadId, postulacionId } = req.params;
    const { accion } = req.body || {};
    if (!accion || !["confirmar", "rechazar"].includes(accion)) {
      return res.status(400).json({ message: "accion debe ser 'confirmar' o 'rechazar'" });
    }

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.status(403).json({ message: "No es postulante" });

    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
      postulant: postulant._id,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    if (po.estado !== "seleccionado_empresa") {
      return res.status(400).json({ message: "Solo puede responder cuando fue seleccionado por la empresa" });
    }

    if (accion === "confirmar") {
      // RQ04_HU003: plazo de N días hábiles para aceptar
      let diasHabiles = 8;
      try {
        const Parameter = (await import("../parameters/parameter.model.js")).default;
        const param = await Parameter.findOne({ code: "DIAS_HABILES_ACEPTAR_SELECCION_MTM", "metadata.active": true }).lean();
        if (param != null && typeof param.value === "number" && param.value > 0) diasHabiles = param.value;
      } catch (_) {}
      if (po.seleccionadoAt) {
        const limite = addBusinessDays(po.seleccionadoAt, diasHabiles);
        if (new Date() > limite) {
          return res.status(400).json({
            message: `El plazo para aceptar o rechazar esta selección ha vencido (${diasHabiles} días hábiles desde la selección).`,
          });
        }
      }
      // RQ04_HU003: máximo 3 MTM aceptadas por periodo académico
      const opp = await OportunidadMTM.findById(oportunidadId).select("periodo").lean();
      if (opp?.periodo) {
        const oportunidadesMismoPeriodo = await OportunidadMTM.find({ periodo: opp.periodo }).select("_id").lean();
        const idsOportunidad = oportunidadesMismoPeriodo.map((o) => o._id);
        const yaAceptadas = await PostulacionMTM.countDocuments({
          postulant: postulant._id,
          estado: "aceptado_estudiante",
          oportunidadMTM: { $in: idsOportunidad },
        });
        if (yaAceptadas >= 3) {
          return res.status(400).json({
            message: "Ya tiene el máximo de 3 monitorías/tutorías/mentorías aceptadas para este periodo académico.",
          });
        }
      }
    }

    const now = new Date();
    if (accion === "confirmar") {
      po.estado = "aceptado_estudiante";
      po.aceptadoEstudianteAt = now;
      po.rechazadoAt = null;
    } else {
      po.estado = "rechazado";
      po.rechazadoAt = now;
      po.aceptadoEstudianteAt = null;
    }
    await po.save();

    if (accion === "confirmar") {
      // RQ04_HU003: notificar a coordinación GUIARTE (plantilla "Posterior a la aceptación de oferta por parte del estudiante")
      try {
        const Evento = (await import("../notificacion/eventos/evento.model.js")).default;
        const { getRenderedActivePlantilla } = await import("../notificacion/plantillasNotificacion/plantillaNotificacion.service.js");
        const evento = await Evento.findOne({ value: "aceptacion_oferta_por_estudiante", tipo: "monitoria" }).select("_id").lean();
        if (evento) {
          const oppFull = await OportunidadMTM.findById(oportunidadId).populate("periodo", "codigo").lean();
          const postulantUser = await Postulant.findById(postulant._id).populate("postulantId", "name email").lean();
          const rendered = await getRenderedActivePlantilla(evento._id, {
            NOMBRE_ESTUDIANTE: postulantUser?.postulantId?.name || "Estudiante",
            NOMBRE_MTM: oppFull?.nombreCargo || "Monitoría/Tutoría/Mentoría",
            PERIODO: oppFull?.periodo?.codigo || "",
          });
          if (rendered) {
            // TODO: enviar correo al coordinador (destinatarios según plantilla o configuración GUIARTE)
            console.log("[MTM] Notificación aceptación estudiante:", rendered.asunto);
          }
        }
      } catch (notifErr) {
        console.error("[MTM] Error al preparar notificación aceptación:", notifErr);
      }
    }

    res.json({
      message: accion === "confirmar" ? "Has confirmado la selección" : "Has rechazado la selección",
      estado: po.estado,
      aceptadoEstudianteAt: po.aceptadoEstudianteAt,
      rechazadoAt: po.rechazadoAt,
    });
  } catch (err) {
    console.error("[MTM] estudianteResponderPostulacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /oportunidades-mtm/:id/applications/:postulacionId/state ───────────
export const updateApplicationStateMTM = async (req, res) => {
  try {
    const { id: oportunidadId, postulacionId } = req.params;
    const { estado } = req.body;

    if (!estado || !["rechazado", "empresa_consulto_perfil"].includes(estado)) {
      return res.status(400).json({
        message: "estado debe ser 'rechazado' o 'empresa_consulto_perfil' (para deshacer rechazo)",
      });
    }

    const po = await PostulacionMTM.findOne({
      _id: postulacionId,
      oportunidadMTM: oportunidadId,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    if (estado === "rechazado") {
      po.estado = "rechazado";
      po.rechazadoAt = new Date();
    } else {
      po.estado = "empresa_consulto_perfil";
      po.rechazadoAt = null;
    }
    await po.save();

    const estadoLabel = estado === "rechazado" ? "Rechazado" : "Revisado";
    res.json({
      message: estado === "rechazado" ? "Postulante rechazado" : "Rechazo revertido",
      estado: po.estado,
      estadoLabel,
    });
  } catch (err) {
    console.error("[MTM] updateApplicationStateMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /oportunidades-mtm/:id/history ───────────────────────────────────────
export const getStatusHistoryMTM = async (req, res) => {
  try {
    const op = await OportunidadMTM.findById(req.params.id)
      .populate("historialEstados.cambiadoPor", "name email")
      .select("historialEstados")
      .lean();

    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const historial = (op.historialEstados || []).map((h) => ({
      estadoAnterior: h.estadoAnterior,
      estadoNuevo: h.estadoNuevo,
      fechaCambio: h.fechaCambio,
      cambiadoPor: h.cambiadoPor,
      motivo: h.motivo,
      comentarios: h.comentarios || null,
    }));

    res.json({ historial });
  } catch (err) {
    console.error("[MTM] getStatusHistoryMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Legalización MTM (RQ04_HU004) ───────────────────────────────────────────
const S3_PREFIX_LEGALIZACIONES = "legalizaciones-mtm";

function isValidObjectId24(id) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}

async function getLegalizacionMTMForStudent(req, postulacionId) {
  if (!isValidObjectId24(postulacionId)) return { error: 400, message: "ID de postulación no válido" };
  const userId = req.user?.id;
  if (!userId) return { error: 401, message: "No autenticado" };
  const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
  if (!postulant) return { error: 403, message: "No es postulante" };
  const po = await PostulacionMTM.findOne({
    _id: postulacionId,
    postulant: postulant._id,
    estado: "aceptado_estudiante",
  })
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo nombreProfesor profesorResponsable categoria vacantes valorPorHora asignaturas programas dedicacionHoras",
      populate: [
        { path: "periodo", select: "codigo" },
        { path: "valorPorHora", select: "value description" },
        { path: "categoria", select: "value description" },
        { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
        { path: "programas", select: "name code" },
        { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email name" } },
      ],
    })
    .populate("postulantProfile")
    .lean();
  if (!po) return { error: 404, message: "Postulación no encontrada o no aceptada" };
  return { po, postulant };
}

export const getLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    let leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId })
      .populate("eps tipoCuenta banco", "value description listId")
      .lean();
    if (!leg) {
      leg = await LegalizacionMTM.create({
        postulacionMTM: postulacionId,
        estado: "borrador",
      });
      leg = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    }

    const opp = result.po.oportunidadMTM;
    const profileId = result.po.postulantProfile?._id ?? null;
    const [postulantUser, postulantDatos, enrolledProgram, cedulaSupport] = await Promise.all([
      Postulant.findById(result.po.postulant).populate("postulantId", "name email").lean(),
      Postulant.findById(result.po.postulant).select("phone address alternateEmail cityResidenceId").populate("cityResidenceId", "name").lean(),
      profileId
        ? ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", select: "facultyId", populate: { path: "facultyId", select: "name" } }).lean()
        : null,
      profileId ? ProfileSupport.findOne({ profileId }).populate("attachmentId", "name").lean() : null,
    ]);

    const cedulaAttachment =
      cedulaSupport?.attachmentId != null
        ? { _id: cedulaSupport.attachmentId._id, name: cedulaSupport.attachmentId.name || "Documento de identidad" }
        : null;

    res.json({
      legalizacion: leg,
      oportunidad: opp,
      postulacion: { _id: result.po._id, aceptadoEstudianteAt: result.po.aceptadoEstudianteAt },
      estudiante: {
        nombre: postulantUser?.postulantId?.name ?? "",
        correoInstitucional: postulantUser?.postulantId?.email ?? "",
        correoAlterno: postulantDatos?.alternateEmail ?? null,
        identificacion: result.po.postulantProfile?.studentCode ?? null,
        celular: postulantDatos?.phone ?? null,
        direccion: postulantDatos?.address ?? null,
        zonaResidencia: null,
        localidadBarrio: postulantDatos?.cityResidenceId?.name ?? null,
        facultad: enrolledProgram?.programFacultyId?.facultyId?.name ?? null,
        programa: enrolledProgram?.programId?.name ?? null,
        cedulaAttachment,
        postulantId: result.po.postulant?._id ?? null,
      },
    });
  } catch (err) {
    console.error("[MTM] getLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const updateLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede editar en estado borrador o en ajuste" });

    const { eps, tipoCuenta, tipoCuentaValor, banco, numeroCuenta } = req.body || {};
    if (eps !== undefined) leg.eps = eps || null;
    if (tipoCuenta !== undefined) leg.tipoCuenta = tipoCuenta || null;
    if (tipoCuentaValor !== undefined) leg.tipoCuentaValor = ["Ahorros", "Corriente"].includes(tipoCuentaValor) ? tipoCuentaValor : null;
    if (banco !== undefined) leg.banco = banco || null;
    if (numeroCuenta !== undefined) leg.numeroCuenta = numeroCuenta ? String(numeroCuenta).trim() : null;
    await leg.save();

    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated });
  } catch (err) {
    console.error("[MTM] updateLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const uploadDocLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const tipo = (req.body?.tipo || req.file?.fieldname || "").toLowerCase().replace(/-/g, "_");
    const validTipos = { certificado_eps: "certificadoEps", certificacion_bancaria: "certificacionBancaria", rut: "rut" };
    const docField = validTipos[tipo] || validTipos.certificado_eps;
    if (!req.file || !req.file.buffer) return res.status(400).json({ message: "No se envió archivo" });
    if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ message: "El archivo no puede superar 5 MB" });
    if (req.file.mimetype !== "application/pdf") return res.status(400).json({ message: "Solo se permiten archivos PDF" });

    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    let leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) {
      leg = await LegalizacionMTM.create({ postulacionMTM: postulacionId, estado: "borrador" });
    }
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede subir documentos en estado borrador o en ajuste" });

    const ext = ".pdf";
    const key = `${S3_PREFIX_LEGALIZACIONES}/${postulacionId}/${tipo}${ext}`;
    await uploadToS3(key, req.file.buffer, { contentType: "application/pdf" });

    const docInfo = {
      key,
      originalName: req.file.originalname || `${tipo}${ext}`,
      size: req.file.size,
      estadoDocumento: "pendiente",
      motivoRechazo: null,
    };
    leg.documentos = leg.documentos || {};
    leg.documentos[docField] = docInfo;
    await leg.save();

    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated, message: "Documento subido correctamente" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento de documentos no está disponible" });
    }
    console.error("[MTM] uploadDocLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

const DOC_TIPO_TO_FIELD = { certificado_eps: "certificadoEps", certificacion_bancaria: "certificacionBancaria", rut: "rut" };

export const getDocumentoLegalizacionUrl = async (req, res) => {
  try {
    const { postulacionId, tipo } = req.params;
    const docField = DOC_TIPO_TO_FIELD[tipo];
    if (!docField) return res.status(400).json({ message: "Tipo de documento no válido" });

    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });

    const doc = leg.documentos?.[docField];
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });

    const url = await getSignedDownloadUrl(doc.key, 3600);
    res.json({ url });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento no está disponible" });
    }
    console.error("[MTM] getDocumentoLegalizacionUrl:", err);
    res.status(500).json({ message: err.message });
  }
};

export const deleteDocumentoLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId, tipo } = req.params;
    const docField = DOC_TIPO_TO_FIELD[tipo];
    if (!docField) return res.status(400).json({ message: "Tipo de documento no válido" });

    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede eliminar documentos en estado borrador o en ajuste" });

    const doc = leg.documentos?.[docField];
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });

    await deleteFromS3(doc.key);
    leg.documentos = leg.documentos || {};
    leg.documentos[docField] = null;
    await leg.save();

    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated, message: "Documento eliminado correctamente" });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento no está disponible" });
    }
    console.error("[MTM] deleteDocumentoLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const remitirRevisionLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "borrador" && leg.estado !== "en_ajuste") return res.status(400).json({ message: "Solo se puede remitir desde estado borrador o en ajuste" });

    const docs = leg.documentos || {};
    if (!docs.certificadoEps?.key || !docs.certificacionBancaria?.key || !docs.rut?.key) {
      return res.status(400).json({ message: "Debe cargar los tres documentos: Certificado EPS, Certificación bancaria y RUT" });
    }
    const tieneTipoCuenta = leg.tipoCuentaValor || leg.tipoCuenta;
    if (!leg.eps || !leg.banco || !tieneTipoCuenta || !leg.numeroCuenta?.trim()) {
      return res.status(400).json({ message: "Complete EPS, Banco, Tipo de cuenta (Ahorros o Corriente) y Número de cuenta" });
    }

    const now = new Date();
    leg.estado = "en_revision";
    leg.enviadoRevisionAt = now;
    await leg.save();

    try {
      const Evento = (await import("../notificacion/eventos/evento.model.js")).default;
      const { getRenderedActivePlantilla } = await import("../notificacion/plantillasNotificacion/plantillaNotificacion.service.js");
      const evento = await Evento.findOne({ value: "envio_revision_legalizacion_monitoria", tipo: "monitoria" }).select("_id").lean();
      if (evento) {
        const opp = await OportunidadMTM.findById(result.po.oportunidadMTM._id).populate("periodo", "codigo").lean();
        const postulantDoc = await Postulant.findById(result.po.postulant).populate("postulantId", "name").lean();
        const rendered = await getRenderedActivePlantilla(evento._id, {
          NOMBRE_ESTUDIANTE: postulantDoc?.postulantId?.name || "Estudiante",
          NOMBRE_MTM: opp?.nombreCargo || "Monitoría",
          PERIODO: opp?.periodo?.codigo || "",
        });
        if (rendered) console.log("[MTM] Notificación envío a revisión:", rendered.asunto);
      }
    } catch (notifErr) {
      console.error("[MTM] Error notificación remitir revisión:", notifErr);
    }

    res.json({
      message: "Legalización remitida a revisión correctamente",
      legalizacion: await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean(),
    });
  } catch (err) {
    console.error("[MTM] remitirRevisionLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Admin: listar legalizaciones MTM (RQ04_HU006) ─────────────────────────────
export const getLegalizacionesMTMAdmin = async (req, res) => {
  try {
    const { estado, periodo, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    const legs = await LegalizacionMTM.find(filter)
      .populate({
        path: "postulacionMTM",
        match: { estado: "aceptado_estudiante" },
        select: "oportunidadMTM postulant postulantProfile aceptadoEstudianteAt",
        populate: [
          {
            path: "oportunidadMTM",
            select: "nombreCargo periodo profesorResponsable programas",
            populate: [
              { path: "periodo", select: "codigo" },
              { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
              { path: "programas", select: "name code" },
            ],
          },
          { path: "postulant", select: "postulantId", populate: { path: "postulantId", select: "name" } },
          { path: "postulantProfile", select: "studentCode" },
        ],
      })
      .sort({ updatedAt: -1 })
      .lean();

    const postulacionesValidas = legs.filter((l) => l.postulacionMTM != null);
    let list = postulacionesValidas.map((l) => {
      const po = l.postulacionMTM;
      const opp = po?.oportunidadMTM;
      const nombreCompleto = po?.postulant?.postulantId?.name || "";
      const programaOportunidad = opp?.programas?.length ? opp.programas.map((p) => p?.name).filter(Boolean).join(", ") : null;
      const coordinador = opp?.profesorResponsable
        ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ")
        : null;
      const periodoCodigo = opp?.periodo?.codigo ?? null;
      return {
        _id: l._id,
        postulacionId: po?._id,
        numeroIdentidad: po?.postulantProfile?.studentCode ?? null,
        nombre: nombreCompleto.split(" ").slice(0, -1).join(" ") || nombreCompleto,
        apellido: nombreCompleto.split(" ").slice(-1)[0] || "",
        programa: programaOportunidad,
        codigoMTM: opp?._id?.toString?.()?.slice(-8) ?? null,
        nombreMTM: opp?.nombreCargo ?? null,
        periodo: periodoCodigo,
        coordinador,
        estadoAlumnoMTM: null,
        estadoMTM: l.estado === "en_revision" ? "en_revision" : l.estado === "aprobada" ? "legalizada" : l.estado === "rechazada" ? "anulada" : l.estado === "en_ajuste" ? "en_ajuste" : l.estado === "borrador" ? "aceptada" : l.estado,
        enviadoRevisionAt: l.enviadoRevisionAt,
        aprobadoAt: l.aprobadoAt,
        rechazadoAt: l.rechazadoAt,
      };
    });

    if (periodo) {
      list = list.filter((r) => r.periodo === periodo);
    }
    const total = list.length;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const start = (pageNum - 1) * limitNum;
    list = list.slice(start, start + limitNum);

    res.json({ data: list, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error("[MTM] getLegalizacionesMTMAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

// Helper: obtener datos completos de una legalización para admin (por postulacionId)
async function getLegalizacionMTMAdminByPostulacion(postulacionId) {
  const po = await PostulacionMTM.findOne({
    _id: postulacionId,
    estado: "aceptado_estudiante",
  })
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo nombreProfesor profesorResponsable categoria vacantes valorPorHora asignaturas programas dedicacionHoras",
      populate: [
        { path: "periodo", select: "codigo" },
        { path: "valorPorHora", select: "value description" },
        { path: "categoria", select: "value description" },
        { path: "asignaturas", select: "nombreAsignatura codAsignatura" },
        { path: "programas", select: "name code" },
        { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email name" } },
      ],
    })
    .populate("postulantProfile")
    .lean();
  if (!po) return null;
  const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId })
    .populate("eps tipoCuenta banco", "value description listId")
    .lean();
  if (!leg) return null;
  const opp = po.oportunidadMTM;
  const profileId = po.postulantProfile?._id ?? null;
  const [postulantUser, postulantDatos, enrolledProgram, cedulaSupport] = await Promise.all([
    Postulant.findById(po.postulant).populate("postulantId", "name email").lean(),
    Postulant.findById(po.postulant).select("phone address alternateEmail cityResidenceId").populate("cityResidenceId", "name").lean(),
    profileId
      ? ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", select: "facultyId", populate: { path: "facultyId", select: "name" } }).lean()
      : null,
    profileId ? ProfileSupport.findOne({ profileId }).populate("attachmentId", "name").lean() : null,
  ]);
  const cedulaAttachment =
    cedulaSupport?.attachmentId != null
      ? { _id: cedulaSupport.attachmentId._id, name: cedulaSupport.attachmentId.name || "Documento de identidad" }
      : null;
  return {
    legalizacion: leg,
    oportunidad: opp,
    postulacion: { _id: po._id, aceptadoEstudianteAt: po.aceptadoEstudianteAt },
    estudiante: {
      nombre: postulantUser?.postulantId?.name ?? "",
      correoInstitucional: postulantUser?.postulantId?.email ?? "",
      correoAlterno: postulantDatos?.alternateEmail ?? null,
      identificacion: po.postulantProfile?.studentCode ?? null,
      celular: postulantDatos?.phone ?? null,
      direccion: postulantDatos?.address ?? null,
      zonaResidencia: null,
      localidadBarrio: postulantDatos?.cityResidenceId?.name ?? null,
      facultad: enrolledProgram?.programFacultyId?.facultyId?.name ?? null,
      programa: enrolledProgram?.programId?.name ?? null,
      cedulaAttachment,
      postulantId: po.postulant ?? null,
    },
  };
}

export const getLegalizacionMTMAdmin = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMAdminByPostulacion(postulacionId);
    if (!result) return res.status(404).json({ message: "Legalización no encontrada" });
    res.json(result);
  } catch (err) {
    console.error("[MTM] getLegalizacionMTMAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getDocumentoLegalizacionUrlAdmin = async (req, res) => {
  try {
    const { postulacionId, tipo } = req.params;
    const docField = DOC_TIPO_TO_FIELD[tipo];
    if (!docField) return res.status(400).json({ message: "Tipo de documento no válido" });
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    const doc = leg.documentos?.[docField];
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    const url = await getSignedDownloadUrl(doc.key, 3600);
    res.json({ url });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "El almacenamiento no está disponible" });
    }
    console.error("[MTM] getDocumentoLegalizacionUrlAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

export const patchDocumentoLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId, tipo } = req.params;
    const { estadoDocumento, motivoRechazo } = req.body || {};
    const docField = DOC_TIPO_TO_FIELD[tipo];
    if (!docField) return res.status(400).json({ message: "Tipo de documento no válido" });
    if (!["aprobado", "rechazado"].includes(estadoDocumento)) {
      return res.status(400).json({ message: "estadoDocumento debe ser aprobado o rechazado" });
    }
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se puede revisar documentos cuando la legalización está en revisión" });
    }
    const doc = leg.documentos?.[docField];
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });
    leg.documentos[docField] = {
      ...doc.toObject ? doc.toObject() : doc,
      estadoDocumento,
      motivoRechazo: estadoDocumento === "rechazado" ? (motivoRechazo || "").trim() || null : null,
    };
    await leg.save();
    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated });
  } catch (err) {
    console.error("[MTM] patchDocumentoLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postAprobarLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se puede aprobar una legalización en estado en revisión" });
    }
    const docs = leg.documentos || {};
    const docFields = ["certificadoEps", "certificacionBancaria", "rut"];
    const algunRechazado = docFields.some((f) => docs[f]?.estadoDocumento === "rechazado");
    const algunPendiente = docFields.some((f) => docs[f]?.key && (!docs[f].estadoDocumento || docs[f].estadoDocumento === "pendiente"));
    if (algunRechazado) {
      return res.status(400).json({ message: "No se puede aprobar: hay documentos rechazados. Solicite ajustes al estudiante." });
    }
    if (algunPendiente) {
      return res.status(400).json({ message: "Debe aprobar o rechazar todos los documentos antes de aprobar la legalización" });
    }
    leg.estado = "aprobada";
    leg.aprobadoAt = new Date();
    leg.rechazoMotivo = null;
    await leg.save();
    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({ legalizacion: updated, message: "Legalización aprobada correctamente" });
  } catch (err) {
    console.error("[MTM] postAprobarLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postRechazarLegalizacionMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { motivo, enviarAjuste } = req.body || {};
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId });
    if (!leg) return res.status(404).json({ message: "Legalización no encontrada" });
    if (leg.estado !== "en_revision") {
      return res.status(400).json({ message: "Solo se puede rechazar una legalización en estado en revisión" });
    }
    const motivoStr = (motivo || "").trim() || null;
    if (enviarAjuste) {
      leg.estado = "en_ajuste";
      leg.rechazoMotivo = motivoStr;
    } else {
      leg.estado = "rechazada";
      leg.rechazadoAt = new Date();
      leg.rechazoMotivo = motivoStr;
    }
    await leg.save();
    const updated = await LegalizacionMTM.findById(leg._id).populate("eps tipoCuenta banco", "value description listId").lean();
    res.json({
      legalizacion: updated,
      message: enviarAjuste ? "Legalización enviada a ajuste para que el estudiante corrija los documentos" : "Legalización rechazada",
    });
  } catch (err) {
    console.error("[MTM] postRechazarLegalizacionMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Plan de trabajo MTM (RQ04_HU006) ───────────────────────────────────────
/** Obtiene datos pre-cargados para el plan (facultad, programa, profesor, etc.) a partir de postulación + oportunidad + estudiante. */
async function getDatosPrecargadosPlanTrabajo(result) {
  const po = result.po;
  const opp = po?.oportunidadMTM;
  const profileId = po?.postulantProfile?._id ?? null;
  const [postulantUser, postulantDatos, enrolledProgram] = await Promise.all([
    Postulant.findById(po.postulant).populate("postulantId", "name email").lean(),
    Postulant.findById(po.postulant).select("phone").lean(),
    profileId
      ? ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name code").populate({ path: "programFacultyId", select: "facultyId", populate: { path: "facultyId", select: "name" } }).lean()
      : null,
  ]);
  const profesorNombre = opp?.profesorResponsable
    ? [opp.profesorResponsable.nombres, opp.profesorResponsable.apellidos].filter(Boolean).join(" ")
    : opp?.nombreProfesor ?? "";
  const asignaturaArea = opp?.asignaturas?.length
    ? opp.asignaturas.map((a) => a.nombreAsignatura || a.codAsignatura).filter(Boolean).join(", ")
    : "";
  return {
    facultad: enrolledProgram?.programFacultyId?.facultyId?.name ?? "",
    programa: enrolledProgram?.programId?.name ?? "",
    asignaturaArea,
    periodo: opp?.periodo?.codigo ?? "",
    profesorResponsable: profesorNombre,
    codigoMonitor: po?.postulantProfile?.studentCode ?? "",
    nombreMonitor: postulantUser?.postulantId?.name ?? "",
    telefono: postulantDatos?.phone ?? "",
    correoInstitucional: postulantUser?.postulantId?.email ?? "",
  };
}

/** GET plan de trabajo. Estudiante: solo su postulación y legalización aprobada. Profesor/admin: por postulacionId. */
export const getPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const isStudent = req.user?.role === "student" || req.user?.modulo === "estudiante";
    if (isStudent) {
      const result = await getLegalizacionMTMForStudent(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
      if (!leg || leg.estado !== "aprobada") return res.status(400).json({ message: "Solo puede gestionar el plan de trabajo cuando la legalización está aprobada" });
      const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).lean();
      if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado. Puede crearlo desde el detalle de la legalización." });
      const datosPrecargados = await getDatosPrecargadosPlanTrabajo(result);
      return res.json({ plan, datosPrecargados, oportunidad: result.po.oportunidadMTM });
    }
    const result = await getLegalizacionMTMAdminByPostulacion(postulacionId);
    if (!result) return res.status(404).json({ message: "No encontrado" });
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    res.json({ plan, oportunidad: result.oportunidad, estudiante: result.estudiante });
  } catch (err) {
    console.error("[MTM] getPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST crear plan de trabajo. Solo estudiante; legalización debe estar aprobada. */
export const createPlanTrabajoMTM = async (req, res) => {
  try {
    const postulacionId = req.params.postulacionId || req.body?.postulacionId;
    if (!postulacionId) return res.status(400).json({ message: "postulacionId es requerido" });
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg || leg.estado !== "aprobada") return res.status(400).json({ message: "Solo puede crear el plan de trabajo cuando la legalización está aprobada" });
    const existente = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (existente) return res.status(400).json({ message: "Ya existe un plan de trabajo para esta legalización" });
    const datosPrecargados = await getDatosPrecargadosPlanTrabajo(result);
    const plan = await PlanDeTrabajoMTM.create({
      postulacionMTM: postulacionId,
      estado: "borrador",
      ...datosPrecargados,
    });
    res.status(201).json({ plan, message: "Plan de trabajo creado" });
  } catch (err) {
    console.error("[MTM] createPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** PUT actualizar plan de trabajo. Solo estudiante; solo en estado borrador o rechazado. */
export const updatePlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { justificacion, objetivoGeneral, objetivosEspecificos, actividades } = req.body || {};
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "borrador" && plan.estado !== "rechazado") return res.status(400).json({ message: "Solo puede editar el plan en estado borrador o rechazado" });
    if (justificacion !== undefined) plan.justificacion = justificacion;
    if (objetivoGeneral !== undefined) plan.objetivoGeneral = objetivoGeneral;
    if (objetivosEspecificos !== undefined) plan.objetivosEspecificos = objetivosEspecificos;
    if (Array.isArray(actividades)) plan.actividades = actividades;
    await plan.save();
    res.json({ plan, message: "Plan actualizado" });
  } catch (err) {
    console.error("[MTM] updatePlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST enviar plan a revisión (estudiante). */
export const enviarRevisionPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "borrador") return res.status(400).json({ message: "Solo puede enviar a revisión un plan en estado borrador" });
    plan.estado = "enviado_revision";
    plan.enviadoRevisionAt = new Date();
    await plan.save();
    res.json({ plan, message: "Plan enviado a revisión" });
  } catch (err) {
    console.error("[MTM] enviarRevisionPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST aprobar plan (profesor/admin). */
export const aprobarPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "enviado_revision") return res.status(400).json({ message: "Solo se puede aprobar un plan enviado a revisión" });
    plan.estado = "aprobado";
    plan.aprobadoPorProfesorAt = new Date();
    plan.aprobadoPor = req.user?.id ?? null;
    await plan.save();
    res.json({ plan, message: "Plan aprobado" });
  } catch (err) {
    console.error("[MTM] aprobarPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST rechazar plan (profesor/admin). */
export const rechazarPlanTrabajoMTM = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const { motivo } = req.body || {};
    const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de trabajo no encontrado" });
    if (plan.estado !== "enviado_revision") return res.status(400).json({ message: "Solo se puede rechazar un plan enviado a revisión" });
    plan.estado = "rechazado";
    plan.rechazadoAt = new Date();
    plan.rechazoMotivo = (motivo || "").trim() || null;
    await plan.save();
    res.json({ plan, message: "Plan rechazado. El estudiante podrá modificarlo y volver a enviar." });
  } catch (err) {
    console.error("[MTM] rechazarPlanTrabajoMTM:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET plan de trabajo: datos para crear (si no existe). Estudiante; legalización aprobada. */
export const getPlanTrabajoMTMDatosCrear = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getLegalizacionMTMForStudent(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const leg = await LegalizacionMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (!leg || leg.estado !== "aprobada") return res.status(400).json({ message: "Solo puede crear el plan cuando la legalización está aprobada" });
    const existente = await PlanDeTrabajoMTM.findOne({ postulacionMTM: postulacionId }).lean();
    if (existente) return res.json({ plan: existente, yaExiste: true });
    const datosPrecargados = await getDatosPrecargadosPlanTrabajo(result);
    res.json({ datosPrecargados, oportunidad: result.po.oportunidadMTM, yaExiste: false });
  } catch (err) {
    console.error("[MTM] getPlanTrabajoMTMDatosCrear:", err);
    res.status(500).json({ message: err.message });
  }
};
