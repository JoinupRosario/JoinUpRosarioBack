import mongoose from "mongoose";
import OportunidadMTM from "./oportunidadMTM.model.js";
import PostulacionMTM from "./postulacionMTM.model.js";
import Item from "../shared/reference-data/models/item.schema.js"; // asegura registro del modelo "items"
import { buildSearchRegex } from "../../utils/searchUtils.js";
import Postulant from "../postulants/models/postulants.schema.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram, ProfileSkill, ProfileCv } from "../postulants/models/profile/index.js";
import { consultaInfAcademica, consultaAsignatura } from "../../services/uxxiIntegration.service.js";

const POPULATE_FIELDS = [
  { path: "dedicacionHoras", select: "value description listId" },
  { path: "valorPorHora", select: "value description listId" },
  { path: "tipoVinculacion", select: "value description listId" },
  { path: "categoria", select: "value description listId" },
  { path: "periodo", select: "codigo tipo estado" },
  { path: "asignaturas", select: "nombreAsignatura codAsignatura periodo codDepto nombreDepartamento" },
  { path: "programas", select: "name code level labelLevel" },
  { path: "company", select: "name legalName nit" },
  { path: "creadoPor", select: "name email" },
  { path: "actualizadoPor", select: "name email" },
  { path: "cerradoPor", select: "name email" },
  { path: "historialEstados.cambiadoPor", select: "name email" },
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
    const op = await OportunidadMTM.findById(req.params.id).populate(POPULATE_FIELDS);
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
      ...(nombreProfesor !== undefined && { nombreProfesor }),
      ...(unidadAcademica !== undefined && { unidadAcademica }),
      ...(horario !== undefined && { horario }),
      ...(grupo !== undefined && { grupo }),
      ...(programas !== undefined && { programas }),
      ...(funciones !== undefined && { funciones }),
      ...(requisitos !== undefined && { requisitos }),
      actualizadoPor: userId || null
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
      };
    });

    res.json({ data, total: data.length });
  } catch (err) {
    console.error("[MTM] getMisPostulacionesMTM:", err);
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
