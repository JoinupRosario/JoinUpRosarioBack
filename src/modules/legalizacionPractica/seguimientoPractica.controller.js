/**
 * RQ04_HU007 — Actividades de seguimiento plan de práctica.
 * Sin despacho de notificaciones en esta capa (hooks futuros).
 */
import mongoose from "mongoose";
import LegalizacionPractica from "./legalizacionPractica.model.js";
import PlanPractica from "./planPractica.model.js";
import SeguimientoPractica from "./seguimientoPractica.model.js";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import { ProfileEnrolledProgram, ProfileProgramExtraInfo } from "../postulants/models/profile/index.js";
import { uploadToS3, deleteFromS3, getSignedDownloadUrl } from "../../config/s3.config.js";
import { mapModuloToRole } from "../../middlewares/auth.js";
import {
  getPostulacionAceptadaEstudiante,
  assertAdminLegalizacionAccess,
  resolveTutorPractica,
} from "./legalizacionPractica.controller.js";

const S3_PREFIX = "seguimientos-practica";

const HORAS_POR_DIA_EQUIV = Math.max(1, Number(process.env.PRACTICA_SEGUIMIENTO_HORAS_POR_DIA) || 8);
const INTERVALO_MIN_DIAS = Math.max(0, Number(process.env.PRACTICA_SEGUIMIENTO_INTERVALO_DIAS) || 0);

const MIME_TO_EXT = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function userRoleEffective(req) {
  return req.user?.role || mapModuloToRole(req.user?.modulo);
}

function isStudentReq(req) {
  return userRoleEffective(req) === "student";
}

function s3Ext(file) {
  const orig = (file.originalname || "").toLowerCase();
  const dot = orig.lastIndexOf(".");
  if (dot >= 0) {
    const ext = orig.slice(dot);
    if (/^\.[a-z0-9]{1,10}$/i.test(ext)) return ext.toLowerCase();
  }
  return MIME_TO_EXT[file.mimetype] ? `.${MIME_TO_EXT[file.mimetype]}` : ".pdf";
}

async function loadContextSeguimiento(req, postulacionId, { studentOnly }) {
  if (studentOnly) {
    const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (r.error) return r;
    const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!leg || leg.estado !== "aprobada") {
      return { error: 400, message: "Los seguimientos se habilitan cuando la legalización está aprobada." };
    }
    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!plan || plan.estado !== "aprobado") {
      return { error: 400, message: "Los seguimientos se habilitan cuando el plan de práctica está aprobado." };
    }
    return { po: r.po, plan, leg };
  }
  const admin = await assertAdminLegalizacionAccess(req, postulacionId);
  if (admin.error) return admin;
  const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
  if (!plan || plan.estado !== "aprobado") {
    return { error: 400, message: "El plan de práctica debe estar aprobado." };
  }
  return { po: admin.po, plan, leg: admin.leg };
}

function getRangoPractica(opp) {
  const ini = opp?.fechaInicioPractica ? new Date(opp.fechaInicioPractica) : null;
  const fin = opp?.fechaFinPractica ? new Date(opp.fechaFinPractica) : null;
  return { ini, fin };
}

function fechasValidasEnPeriodo(fechaInicio, fechaFin, opp) {
  const { ini, fin } = getRangoPractica(opp);
  if (!ini || !fin) return { ok: false, message: "La oferta no tiene fechas de práctica definidas." };
  const i = new Date(fechaInicio);
  const f = new Date(fechaFin);
  if (i > f) return { ok: false, message: "La fecha de inicio no puede ser posterior a la fecha fin." };
  if (i < ini || f > fin) {
    return { ok: false, message: "Las fechas deben estar dentro del periodo de práctica de la oferta." };
  }
  return { ok: true };
}

/** Exportado para RQ04_HU008 (supervisión) — totales aprobados del registro de actividades. */
export async function computeTotals(postulacionId) {
  const approved = await SeguimientoPractica.find({
    postulacionOportunidad: postulacionId,
    estado: "aprobado",
  }).lean();
  let totalDias = 0;
  let totalHoras = 0;
  for (const s of approved) {
    const c = Number(s.cantidad) || 0;
    if (s.unidadTiempo === "dias") totalDias += c;
    else totalHoras += c;
  }
  const totalDiasHorasAcumuladas = totalHoras + totalDias * HORAS_POR_DIA_EQUIV;
  return {
    totalDiasAprobados: totalDias,
    totalHorasAprobadas: totalHoras,
    totalDiasHorasAcumuladas,
    horasPorDiaEquivalente: HORAS_POR_DIA_EQUIV,
  };
}

async function assertIntervaloRegistro(postulacionId) {
  if (INTERVALO_MIN_DIAS <= 0) return { ok: true };
  const last = await SeguimientoPractica.findOne({ postulacionOportunidad: postulacionId })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  if (!last?.createdAt) return { ok: true };
  const ms = INTERVALO_MIN_DIAS * 86400000;
  if (Date.now() - new Date(last.createdAt).getTime() < ms) {
    return {
      ok: false,
      message: `Debe esperar al menos ${INTERVALO_MIN_DIAS} día(s) entre registros de seguimiento (parametrización).`,
    };
  }
  return { ok: true };
}

export async function getSeguimientosPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const studentOnly = isStudentReq(req);
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    const planDoc = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    const list = await SeguimientoPractica.find({ postulacionOportunidad: postulacionId })
      .sort({ fechaInicio: -1, createdAt: -1 })
      .populate("creadoPor", "name email")
      .populate("aprobadoPor", "name email")
      .lean();

    const totals = await computeTotals(postulacionId);
    const pendientes = await SeguimientoPractica.countDocuments({
      postulacionOportunidad: postulacionId,
      estado: "pendiente_revision",
    });

    const actividadesPlan =
      planDoc?.modoPlan === "formato_ur" && Array.isArray(planDoc.actividades)
        ? planDoc.actividades.map((a) => (a.tema || "").trim()).filter(Boolean)
        : [];

    res.json({
      data: list,
      totals,
      pendientesRevision: pendientes,
      planPractica: {
        seguimientoCasoCerrado: !!planDoc?.seguimientoCasoCerrado,
        seguimientoCerradoAt: planDoc?.seguimientoCerradoAt ?? null,
      },
      actividadesPlan,
      parametros: {
        intervaloMinDiasEntreRegistros: INTERVALO_MIN_DIAS,
        horasPorDiaEquivalente: HORAS_POR_DIA_EQUIV,
      },
    });
  } catch (err) {
    console.error("[SeguimientoPractica] getSeguimientosPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function createSeguimientoPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: true });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    if (ctx.plan.seguimientoCasoCerrado) {
      return res.status(400).json({ message: "El caso de seguimiento fue cerrado por coordinación. No se pueden agregar actividades." });
    }

    const intOk = await assertIntervaloRegistro(postulacionId);
    if (!intOk.ok) return res.status(400).json({ message: intOk.message });

    const body = req.body || {};
    const actividad = String(body.actividad || "").trim();
    const tipoActividad = String(body.tipoActividad || "").trim();
    const observaciones = String(body.observaciones || "").trim();
    const descripcion = String(body.descripcion || "").trim().slice(0, 5000);
    const unidadTiempo = body.unidadTiempo === "horas" ? "horas" : "dias";
    const cantidad = body.cantidad != null ? Number(body.cantidad) : NaN;

    if (!actividad) return res.status(400).json({ message: "El campo Actividad es obligatorio." });
    if (!tipoActividad) return res.status(400).json({ message: "El tipo de actividad es obligatorio." });
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return res.status(400).json({ message: "Indique una cantidad válida de días u horas." });
    }
    if (cantidad === 0) {
      return res.status(400).json({ message: "Registre un valor mayor a cero en días o en horas." });
    }

    const fechaInicio = body.fechaInicio ? new Date(body.fechaInicio) : null;
    const fechaFin = body.fechaFin ? new Date(body.fechaFin) : null;
    if (!fechaInicio || !fechaFin || Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) {
      return res.status(400).json({ message: "Fecha inicio y fecha fin son obligatorias." });
    }

    const opp = ctx.po.opportunity;
    const fv = fechasValidasEnPeriodo(fechaInicio, fechaFin, opp);
    if (!fv.ok) return res.status(400).json({ message: fv.message });

    const seg = await SeguimientoPractica.create({
      postulacionOportunidad: postulacionId,
      actividad,
      tipoActividad,
      fechaInicio,
      fechaFin,
      observaciones,
      descripcion,
      unidadTiempo,
      cantidad,
      estado: "pendiente_revision",
      creadoPor: req.user?.id ?? null,
    });

    const populated = await SeguimientoPractica.findById(seg._id)
      .populate("creadoPor", "name email")
      .populate("aprobadoPor", "name email")
      .lean();

    res.status(201).json({ seguimiento: populated, message: "Actividad registrada. Queda pendiente de aprobación del monitor." });
  } catch (err) {
    console.error("[SeguimientoPractica] createSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function updateSeguimientoPractica(req, res) {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: isStudentReq(req) });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    if (isStudentReq(req) && ctx.plan.seguimientoCasoCerrado) {
      return res.status(400).json({ message: "El caso de seguimiento está cerrado." });
    }

    const seg = await SeguimientoPractica.findOne({ _id: seguimientoId, postulacionOportunidad: postulacionId });
    if (!seg) return res.status(404).json({ message: "Registro no encontrado" });

    const editable =
      seg.estado === "pendiente_revision" || (seg.estado === "rechazado" && isStudentReq(req));
    if (!editable) {
      return res.status(400).json({ message: "Solo puede editar registros pendientes de aprobación o rechazados." });
    }

    if (isStudentReq(req)) {
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(r.error).json({ message: r.message });
    }

    const body = req.body || {};
    if (body.actividad !== undefined) seg.actividad = String(body.actividad || "").trim();
    if (body.tipoActividad !== undefined) seg.tipoActividad = String(body.tipoActividad || "").trim();
    if (body.observaciones !== undefined) seg.observaciones = String(body.observaciones || "").trim();
    if (body.descripcion !== undefined) seg.descripcion = String(body.descripcion || "").trim().slice(0, 5000);
    if (body.unidadTiempo !== undefined) seg.unidadTiempo = body.unidadTiempo === "horas" ? "horas" : "dias";
    if (body.cantidad !== undefined) seg.cantidad = Number(body.cantidad);
    if (body.fechaInicio !== undefined) seg.fechaInicio = new Date(body.fechaInicio);
    if (body.fechaFin !== undefined) seg.fechaFin = new Date(body.fechaFin);

    if (!seg.actividad || !seg.tipoActividad) {
      return res.status(400).json({ message: "Actividad y tipo de actividad son obligatorios." });
    }
    if (!Number.isFinite(seg.cantidad) || seg.cantidad <= 0) {
      return res.status(400).json({ message: "La cantidad debe ser mayor a cero." });
    }

    const fv = fechasValidasEnPeriodo(seg.fechaInicio, seg.fechaFin, ctx.po.opportunity);
    if (!fv.ok) return res.status(400).json({ message: fv.message });

    if (seg.estado === "rechazado") {
      seg.estado = "pendiente_revision";
      seg.observacionesRechazo = null;
      seg.rechazadoAt = null;
      seg.fechaAprobacionMonitor = null;
      seg.aprobadoPor = null;
    }

    seg.actualizadoPor = req.user?.id ?? null;
    await seg.save();

    const updated = await SeguimientoPractica.findById(seg._id)
      .populate("creadoPor", "name email")
      .populate("aprobadoPor", "name email")
      .lean();

    res.json({ seguimiento: updated, message: "Registro actualizado." });
  } catch (err) {
    console.error("[SeguimientoPractica] updateSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function deleteSeguimientoPractica(req, res) {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: true });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    if (ctx.plan.seguimientoCasoCerrado) {
      return res.status(400).json({ message: "El caso de seguimiento está cerrado." });
    }

    const seg = await SeguimientoPractica.findOne({ _id: seguimientoId, postulacionOportunidad: postulacionId });
    if (!seg) return res.status(404).json({ message: "Registro no encontrado" });
    if (seg.estado !== "pendiente_revision") {
      return res.status(400).json({ message: "Solo puede eliminar registros pendientes de aprobación." });
    }

    for (const d of seg.documentos || []) {
      if (d?.key) {
        try {
          await deleteFromS3(d.key);
        } catch (_) {
          /* ignore */
        }
      }
    }
    await SeguimientoPractica.deleteOne({ _id: seguimientoId });
    res.json({ message: "Registro eliminado" });
  } catch (err) {
    console.error("[SeguimientoPractica] deleteSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function aprobarSeguimientoPractica(req, res) {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: false });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    const seg = await SeguimientoPractica.findOne({ _id: seguimientoId, postulacionOportunidad: postulacionId });
    if (!seg) return res.status(404).json({ message: "Registro no encontrado" });
    if (seg.estado !== "pendiente_revision") {
      return res.status(400).json({ message: "Solo se aprueban registros pendientes de aprobación." });
    }

    seg.estado = "aprobado";
    seg.fechaAprobacionMonitor = new Date();
    seg.aprobadoPor = req.user?.id ?? null;
    seg.observacionesRechazo = null;
    seg.rechazadoAt = null;
    await seg.save();

    const updated = await SeguimientoPractica.findById(seg._id)
      .populate("creadoPor", "name email")
      .populate("aprobadoPor", "name email")
      .lean();

    res.json({ seguimiento: updated, message: "Actividad aprobada." });
  } catch (err) {
    console.error("[SeguimientoPractica] aprobarSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function rechazarSeguimientoPractica(req, res) {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const { observaciones } = req.body || {};
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: false });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    const motivo = String(observaciones || "").trim();
    if (!motivo) return res.status(400).json({ message: "Las observaciones son obligatorias al rechazar." });

    const seg = await SeguimientoPractica.findOne({ _id: seguimientoId, postulacionOportunidad: postulacionId });
    if (!seg) return res.status(404).json({ message: "Registro no encontrado" });
    if (seg.estado !== "pendiente_revision") {
      return res.status(400).json({ message: "Solo se rechazan registros pendientes de aprobación." });
    }

    seg.estado = "rechazado";
    seg.observacionesRechazo = motivo;
    seg.rechazadoAt = new Date();
    seg.fechaAprobacionMonitor = null;
    seg.aprobadoPor = null;
    await seg.save();

    const updated = await SeguimientoPractica.findById(seg._id).populate("creadoPor", "name email").lean();
    res.json({ seguimiento: updated, message: "Registro rechazado. El estudiante puede corregir y reenviar." });
  } catch (err) {
    console.error("[SeguimientoPractica] rechazarSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function uploadDocumentoSeguimientoPractica(req, res) {
  try {
    const { postulacionId, seguimientoId } = req.params;
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: true });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    if (ctx.plan.seguimientoCasoCerrado) {
      return res.status(400).json({ message: "El caso de seguimiento está cerrado." });
    }

    if (!req.file?.buffer) return res.status(400).json({ message: "Archivo requerido." });

    const seg = await SeguimientoPractica.findOne({ _id: seguimientoId, postulacionOportunidad: postulacionId });
    if (!seg) return res.status(404).json({ message: "Registro no encontrado" });
    const editable = seg.estado === "pendiente_revision" || seg.estado === "rechazado";
    if (!editable) return res.status(400).json({ message: "No puede adjuntar documentos en el estado actual." });

    const ext = s3Ext(req.file);
    const docId = new mongoose.Types.ObjectId();
    const key = `${S3_PREFIX}/${postulacionId}/${seguimientoId}/${String(docId)}${ext}`;
    await uploadToS3(key, req.file.buffer, { contentType: req.file.mimetype || "application/octet-stream" });

    if (!Array.isArray(seg.documentos)) seg.documentos = [];
    seg.documentos.push({
      _id: docId,
      key,
      originalName: req.file.originalname || `adjunto${ext}`,
      contentType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    });
    await seg.save();

    const updated = await SeguimientoPractica.findById(seg._id).populate("creadoPor", "name email").lean();
    res.json({ seguimiento: updated, message: "Documento cargado" });
  } catch (err) {
    console.error("[SeguimientoPractica] uploadDocumentoSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getDocumentoSeguimientoPracticaUrl(req, res) {
  try {
    const { postulacionId, seguimientoId, documentoId } = req.params;
    const studentOnly = isStudentReq(req);
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    const seg = await SeguimientoPractica.findOne({ _id: seguimientoId, postulacionOportunidad: postulacionId }).lean();
    if (!seg) return res.status(404).json({ message: "Registro no encontrado" });
    const doc = (seg.documentos || []).find((d) => String(d._id) === String(documentoId));
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });

    const name = doc.originalName || "documento";
    const url = await getSignedDownloadUrl(doc.key, 3600, {
      responseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      responseContentType: doc.contentType || "application/octet-stream",
    });
    res.json({ url });
  } catch (err) {
    console.error("[SeguimientoPractica] getDocumentoSeguimientoPracticaUrl:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function deleteDocumentoSeguimientoPractica(req, res) {
  try {
    const { postulacionId, seguimientoId, documentoId } = req.params;
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: true });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    if (ctx.plan.seguimientoCasoCerrado) {
      return res.status(400).json({ message: "El caso de seguimiento está cerrado." });
    }

    const seg = await SeguimientoPractica.findOne({ _id: seguimientoId, postulacionOportunidad: postulacionId });
    if (!seg) return res.status(404).json({ message: "Registro no encontrado" });
    const editable = seg.estado === "pendiente_revision" || seg.estado === "rechazado";
    if (!editable) return res.status(400).json({ message: "No puede eliminar documentos en el estado actual." });

    const idx = (seg.documentos || []).findIndex((d) => String(d._id) === String(documentoId));
    if (idx < 0) return res.status(404).json({ message: "Documento no encontrado" });
    const [removed] = seg.documentos.splice(idx, 1);
    if (removed?.key) {
      try {
        await deleteFromS3(removed.key);
      } catch (_) {
        /* ignore */
      }
    }
    await seg.save();
    const updated = await SeguimientoPractica.findById(seg._id).lean();
    res.json({ seguimiento: updated, message: "Documento eliminado" });
  } catch (err) {
    console.error("[SeguimientoPractica] deleteDocumentoSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postCerrarCasoSeguimientoPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly: false });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan no encontrado" });
    if (plan.seguimientoCasoCerrado) {
      return res.status(400).json({ message: "El caso de seguimiento ya está cerrado." });
    }

    plan.seguimientoCasoCerrado = true;
    plan.seguimientoCerradoAt = new Date();
    plan.seguimientoCerradoPor = req.user?.id ?? null;
    await plan.save();

    res.json({
      plan: await PlanPractica.findById(plan._id).lean(),
      message: "Caso de seguimiento cerrado. El estudiante ya no podrá registrar nuevas actividades.",
    });
  } catch (err) {
    console.error("[SeguimientoPractica] postCerrarCasoSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

async function enrichRowForReport(po, seg) {
  const opp = po.opportunity;
  const postulacionId = po._id;
  const tutor = resolveTutorPractica(opp, postulacionId);
  const monitorNombre = opp?.creadoPor?.name || "";
  const monitorEmail = opp?.creadoPor?.email || "";

  const profileId = po.postulantProfile?._id ?? po.postulantProfile;
  let programa = "";
  let semestre = "";
  let nota = "";
  if (profileId) {
    const enr = await ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name").lean();
    programa = enr?.programId?.name || "";
    if (enr?._id) {
      const ex = await ProfileProgramExtraInfo.findOne({ enrolledProgramId: enr._id }).lean();
      if (ex?.accordingCreditSemester != null) semestre = String(ex.accordingCreditSemester);
      if (ex?.cumulativeAverage != null && ex.cumulativeAverage !== "") nota = String(ex.cumulativeAverage);
    }
  }

  const estudianteNombre = po.postulant?.postulantId?.name || "";
  const estudianteEmail = po.postulant?.postulantId?.email || "";

  const dias = seg.unidadTiempo === "dias" ? seg.cantidad : "";
  const horas = seg.unidadTiempo === "horas" ? seg.cantidad : "";
  const aprobado = seg.estado === "aprobado" ? "Sí" : seg.estado === "rechazado" ? "No" : "Pendiente";
  const comentarios = [seg.observaciones, seg.observacionesRechazo].filter(Boolean).join(" | ");

  return {
    actividad: seg.actividad,
    fechaInicio: seg.fechaInicio ? new Date(seg.fechaInicio).toISOString().slice(0, 10) : "",
    fechaFin: seg.fechaFin ? new Date(seg.fechaFin).toISOString().slice(0, 10) : "",
    tipoActividad: seg.tipoActividad,
    monitorNombre,
    monitorEmail,
    tutorEscenarioNombre: tutor.nombres,
    tutorEscenarioEmail: tutor.email !== "—" ? tutor.email : "",
    estudianteNombre,
    estudianteEmail,
    programaEstudios: programa,
    semestre,
    dias,
    horas,
    nota,
    aprobado,
    estado: seg.estado,
    fechaAprobacionMonitor: seg.fechaAprobacionMonitor ? new Date(seg.fechaAprobacionMonitor).toISOString().slice(0, 10) : "",
    comentarios,
    descripcion: (seg.descripcion || "").replace(/\r?\n/g, " ").slice(0, 500),
  };
}

export async function getReporteCsvSeguimientoPractica(req, res) {
  try {
    const { periodo } = req.query;
    const filterPo = { estado: "aceptado_estudiante" };
    const pos = await PostulacionOportunidad.find(filterPo)
      .populate({
        path: "opportunity",
        select: "periodo nombreCargo fechaInicioPractica fechaFinPractica creadoPor company",
        populate: [
          { path: "periodo", select: "codigo" },
          { path: "creadoPor", select: "name email" },
          { path: "company", select: "name" },
        ],
      })
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .populate("postulantProfile", "studentCode")
      .lean();

    let rows = pos;
    if (periodo) {
      rows = rows.filter((p) => p.opportunity?.periodo?.codigo === periodo);
    }

    const segsOut = [];
    for (const po of rows) {
      const plan = await PlanPractica.findOne({ postulacionOportunidad: po._id, estado: "aprobado" }).select("_id").lean();
      if (!plan) continue;
      const segs = await SeguimientoPractica.find({ postulacionOportunidad: po._id }).sort({ fechaInicio: -1 }).lean();
      for (const seg of segs) {
        const r = await enrichRowForReport(po, seg);
        segsOut.push({ postulacionId: String(po._id), ...r });
      }
    }

    const headers = [
      "postulacionId",
      "actividad",
      "fechaInicio",
      "fechaFin",
      "tipoActividad",
      "monitorNombre",
      "monitorEmail",
      "tutorEscenarioNombre",
      "tutorEscenarioEmail",
      "estudianteNombre",
      "estudianteEmail",
      "programaEstudios",
      "semestre",
      "dias",
      "horas",
      "nota",
      "aprobado",
      "estado",
      "fechaAprobacionMonitor",
      "comentarios",
      "descripcion",
    ];

    const esc = (v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [headers.join(",")];
    for (const row of segsOut) {
      lines.push(headers.map((h) => esc(row[h])).join(","));
    }

    const csv = "\uFEFF" + lines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reporte_seguimientos_practica_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[SeguimientoPractica] getReporteCsvSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getEstadisticasSeguimientoPractica(req, res) {
  try {
    const { periodo } = req.query;
    const pos = await PostulacionOportunidad.find({ estado: "aceptado_estudiante" })
      .populate({ path: "opportunity", select: "periodo", populate: { path: "periodo", select: "codigo" } })
      .select("_id")
      .lean();

    let ids = pos.map((p) => p._id);
    if (periodo) {
      ids = pos.filter((p) => p.opportunity?.periodo?.codigo === periodo).map((p) => p._id);
    }

    const withPlan = await PlanPractica.find({
      postulacionOportunidad: { $in: ids },
      estado: "aprobado",
    })
      .select("postulacionOportunidad")
      .lean();
    const postIds = withPlan.map((p) => p.postulacionOportunidad);

    const totalRegistros = await SeguimientoPractica.countDocuments({ postulacionOportunidad: { $in: postIds } });
    const pendientes = await SeguimientoPractica.countDocuments({
      postulacionOportunidad: { $in: postIds },
      estado: "pendiente_revision",
    });
    const aprobados = await SeguimientoPractica.countDocuments({
      postulacionOportunidad: { $in: postIds },
      estado: "aprobado",
    });
    const rechazados = await SeguimientoPractica.countDocuments({
      postulacionOportunidad: { $in: postIds },
      estado: "rechazado",
    });

    const totAgg = await SeguimientoPractica.aggregate([
      { $match: { postulacionOportunidad: { $in: postIds }, estado: "aprobado" } },
      {
        $group: {
          _id: null,
          totalHoras: {
            $sum: {
              $cond: [
                { $eq: ["$unidadTiempo", "horas"] },
                { $toDouble: { $ifNull: ["$cantidad", 0] } },
                0,
              ],
            },
          },
          totalDias: {
            $sum: {
              $cond: [
                { $eq: ["$unidadTiempo", "dias"] },
                { $toDouble: { $ifNull: ["$cantidad", 0] } },
                0,
              ],
            },
          },
        },
      },
    ]);
    const totalHoras = totAgg[0]?.totalHoras ?? 0;
    const totalDias = totAgg[0]?.totalDias ?? 0;

    res.json({
      postulacionesConPlanAprobado: postIds.length,
      totalRegistros,
      pendientesRevision: pendientes,
      aprobados,
      rechazados,
      totalHorasAprobadas: totalHoras,
      totalDiasAprobados: totalDias,
      totalDiasHorasAcumuladas: totalHoras + totalDias * HORAS_POR_DIA_EQUIV,
      horasPorDiaEquivalente: HORAS_POR_DIA_EQUIV,
    });
  } catch (err) {
    console.error("[SeguimientoPractica] getEstadisticasSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getRegistroDocumentoSeguimientoPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const studentOnly = isStudentReq(req);
    const ctx = await loadContextSeguimiento(req, postulacionId, { studentOnly });
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    const list = await SeguimientoPractica.find({ postulacionOportunidad: postulacionId })
      .sort({ fechaInicio: 1 })
      .lean();
    const totals = await computeTotals(postulacionId);
    const po = ctx.po;
    const postulantRef = po.postulant?._id ?? po.postulant;
    let est = "";
    if (postulantRef) {
      const pDoc = await Postulant.findById(postulantRef).populate("postulantId", "name").lean();
      est = pDoc?.postulantId?.name || "";
    }
    const opp = po.opportunity;

    const rows = list
      .map(
        (s) => `<tr>
<td>${escapeHtml(s.actividad)}</td>
<td>${escapeHtml(s.tipoActividad)}</td>
<td>${s.fechaInicio ? new Date(s.fechaInicio).toLocaleDateString("es-CO") : ""}</td>
<td>${s.fechaFin ? new Date(s.fechaFin).toLocaleDateString("es-CO") : ""}</td>
<td>${s.unidadTiempo === "dias" ? "Días" : "Horas"}</td>
<td>${s.cantidad}</td>
<td>${escapeHtml(s.estado)}</td>
<td>${s.fechaAprobacionMonitor ? new Date(s.fechaAprobacionMonitor).toLocaleDateString("es-CO") : "—"}</td>
</tr>`
      )
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Registro de seguimiento</title>
<style>body{font-family:Arial,sans-serif;padding:24px}h1{color:#c41e3a}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:8px;font-size:12px}th{background:#f3f4f6}</style></head><body>
<h1>Registro de actividades de seguimiento — práctica</h1>
<p><strong>Estudiante:</strong> ${escapeHtml(est || "—")}</p>
<p><strong>Práctica:</strong> ${escapeHtml(opp?.nombreCargo || "")}</p>
<p><strong>Totales aprobados:</strong> ${totals.totalDiasAprobados} día(s), ${totals.totalHorasAprobadas} hora(s). Equivalente acumulado: ${totals.totalDiasHorasAcumuladas.toFixed(1)} h-eq.</p>
<table><thead><tr><th>Actividad</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Unidad</th><th>Cantidad</th><th>Estado</th><th>Aprobación monitor</th></tr></thead><tbody>
${rows || "<tr><td colspan='8'>Sin registros</td></tr>"}
</tbody></table>
<p style="font-size:11px;color:#666">Generado ${new Date().toLocaleString("es-CO")}</p>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("[SeguimientoPractica] getRegistroDocumentoSeguimientoPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
