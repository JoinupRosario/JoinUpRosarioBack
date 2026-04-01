/**
 * RQ04_HU008 — Supervisión de la práctica (monitor). Sin notificaciones en esta capa.
 */
import mongoose from "mongoose";
import LegalizacionPractica from "./legalizacionPractica.model.js";
import PlanPractica from "./planPractica.model.js";
import SupervisionPractica from "./supervisionPractica.model.js";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import User from "../users/user.model.js";
import { ProfileEnrolledProgram, ProfileProgramExtraInfo } from "../postulants/models/profile/index.js";
import { uploadToS3, deleteFromS3, getSignedDownloadUrl } from "../../config/s3.config.js";
import { mapModuloToRole } from "../../middlewares/auth.js";
import { buildSupervisionPracticaPdf } from "../../services/supervisionPracticaPdf.service.js";
import {
  getPostulacionAceptadaEstudiante,
  assertAdminLegalizacionAccess,
  resolveTutorPractica,
} from "./legalizacionPractica.controller.js";
import { computeTotals } from "./seguimientoPractica.controller.js";

const S3_PREFIX = "supervisiones-practica";

function normalizeEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function emailsMatch(a, b) {
  const x = normalizeEmail(a);
  const y = normalizeEmail(b);
  return x && y && x === y;
}

function isValidEmail(v) {
  const s = normalizeEmail(v);
  return s.length > 3 && s.includes("@");
}

function userRoleEffective(req) {
  return req.user?.role || mapModuloToRole(req.user?.modulo);
}

function userIsAdminLike(req) {
  const r = userRoleEffective(req);
  return ["admin", "superadmin", "leader"].includes(r);
}

function getClientIp(req) {
  const x = req.headers["x-forwarded-for"];
  if (typeof x === "string" && x.trim()) return x.split(",")[0].trim().slice(0, 64);
  return (req.ip || req.socket?.remoteAddress || "").slice(0, 64) || null;
}

function splitNombreCompleto(name) {
  const s = String(name || "").trim();
  if (!s) return { nombres: "", apellidos: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { nombres: parts[0], apellidos: "" };
  return { nombres: parts[0], apellidos: parts.slice(1).join(" ") };
}

const populateOppSupervision = [
  { path: "company", populate: { path: "contacts" } },
  { path: "creadoPor", select: "name email" },
  { path: "periodo", select: "codigo" },
];

async function loadPostulacionContext(postulacionId) {
  return PostulacionOportunidad.findById(postulacionId)
    .populate({ path: "opportunity", populate: populateOppSupervision })
    .populate("postulantProfile", "studentCode")
    .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
    .lean();
}

async function assertSupervisionHabilitada(postulacionId) {
  const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
  if (!leg || leg.estado !== "aprobada") {
    return { error: 400, message: "La legalización debe estar aprobada." };
  }
  const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
  if (!plan || plan.estado !== "aprobado") {
    return { error: 400, message: "El plan de práctica debe estar aprobado." };
  }
  return { leg, plan, ok: true };
}

async function puedeActuarComoMonitor(req, po) {
  if (userIsAdminLike(req)) return true;
  const u = await User.findById(req.user?.id).select("email").lean();
  const email = normalizeEmail(u?.email);
  const creado = normalizeEmail(po?.opportunity?.creadoPor?.email);
  return email && creado && email === creado;
}

async function snapshotEstudianteMonitor(po, postulacionId, req) {
  const opp = po.opportunity;
  const profileId = po.postulantProfile?._id ?? po.postulantProfile;
  const [totales, postulantUser, enrolled] = await Promise.all([
    computeTotals(postulacionId),
    Postulant.findById(po.postulant).populate("postulantId", "name email").lean(),
    profileId
      ? ProfileEnrolledProgram.findOne({ profileId }).populate("programId", "name").lean()
      : null,
  ]);
  let semestre = "";
  let planEstudios = enrolled?.programId?.name || "";
  if (enrolled?._id) {
    const ex = await ProfileProgramExtraInfo.findOne({ enrolledProgramId: enrolled._id }).lean();
    if (ex?.accordingCreditSemester != null) semestre = String(ex.accordingCreditSemester);
  }
  const monitorUser = await User.findById(req.user?.id).select("name email").lean();
  const sp = splitNombreCompleto(monitorUser?.name);
  return {
    emailEstudiante: normalizeEmail(postulantUser?.postulantId?.email) || "",
    planEstudios,
    semestre,
    diasHorasAcumuladasAlMomento: totales?.totalDiasHorasAcumuladas ?? null,
    monitorNombres: sp.nombres,
    monitorApellidos: sp.apellidos,
    monitorEmail: normalizeEmail(monitorUser?.email) || "",
  };
}

async function generarPdfYGuardar(supDoc) {
  const plain = supDoc.toObject ? supDoc.toObject() : supDoc;
  const pdfBuffer = await buildSupervisionPracticaPdf({
    tipoActividadSeguimiento: plain.tipoActividadSeguimiento,
    fecha: plain.fecha,
    tipoSeguimientoMedio: plain.tipoSeguimientoMedio,
    productoOInforme: plain.productoOInforme,
    ponderacionPorcentaje: plain.ponderacionPorcentaje,
    diasHorasAcumuladasAlMomento: plain.diasHorasAcumuladasAlMomento,
    nota: plain.nota,
    aprueba: plain.aprueba,
    observaciones: plain.observaciones,
    monitorNombres: plain.monitorNombres,
    monitorApellidos: plain.monitorApellidos,
    monitorEmail: plain.monitorEmail,
    planEstudios: plain.planEstudios,
    semestre: plain.semestre,
    emailEstudiante: plain.emailEstudiante,
    firmas: plain.firmas,
  });
  const key = `${S3_PREFIX}/pdf/${plain._id}/${Date.now()}.pdf`;
  await uploadToS3(key, pdfBuffer, { contentType: "application/pdf" });
  return key;
}

async function recalcularNotaDefinitivaPlan(postulacionId) {
  const list = await SupervisionPractica.find({
    postulacionOportunidad: postulacionId,
    estado: "cerrado",
  }).lean();
  if (!list.length) return;
  let suma = 0;
  let peso = 0;
  for (const s of list) {
    const p = Number(s.ponderacionPorcentaje) || 0;
    const n = s.nota != null ? Number(s.nota) : null;
    if (n != null && !Number.isNaN(n) && p > 0) {
      suma += n * (p / 100);
      peso += p;
    }
  }
  const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
  if (!plan) return;
  plan.notaDefinitivaSupervision = peso > 0 ? Math.round(suma * 100) / 100 : null;
  const tieneFinal = list.some((s) => s.tipoActividadSeguimiento === "final");
  plan.supervisionInformesCompleto = tieneFinal;
  await plan.save();
}

export async function getSupervisionPracticaDatosCrear(req, res) {
  try {
    const { postulacionId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const can = await puedeActuarComoMonitor(req, po);
    if (!can) return res.status(403).json({ message: "Solo el monitor o coordinación puede consultar los datos de creación." });

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    const seguimientosPlan = Array.isArray(plan?.seguimientosPlan) ? plan.seguimientosPlan : [];
    const totales = await computeTotals(postulacionId);

    let fechaSugeridaParcial = null;
    let fechaSugeridaFinal = null;
    if (seguimientosPlan.length) {
      const fechas = seguimientosPlan.map((s) => (s.fecha ? new Date(s.fecha) : null)).filter(Boolean);
      fechas.sort((a, b) => a - b);
      if (fechas.length) {
        fechaSugeridaParcial = fechas[0];
        fechaSugeridaFinal = fechas[fechas.length - 1];
      }
    }

    res.json({
      seguimientosPlan,
      totalesRegistroActividades: totales,
      fechaSugeridaParcial,
      fechaSugeridaFinal,
      planPracticaId: plan?._id,
    });
  } catch (err) {
    console.error("[SupervisionPractica] getSupervisionPracticaDatosCrear:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function listSupervisionPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const isStudent = userRoleEffective(req) === "student";
    if (isStudent) {
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(r.error).json({ message: r.message });
    } else {
      const can = await puedeActuarComoMonitor(req, po);
      if (!can) return res.status(403).json({ message: "No autorizado como monitor de esta práctica." });
    }

    const list = await SupervisionPractica.find({ postulacionOportunidad: postulacionId })
      .sort({ createdAt: -1 })
      .populate("creadoPor", "name email")
      .lean();

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).select("notaDefinitivaSupervision supervisionInformesCompleto").lean();

    res.json({ data: list, planNota: plan });
  } catch (err) {
    console.error("[SupervisionPractica] listSupervisionPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function createSupervisionPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const can = await puedeActuarComoMonitor(req, po);
    if (!can) return res.status(403).json({ message: "Solo el monitor (líder de práctica) o coordinación puede crear informes." });

    const body = req.body || {};
    const tipo = body.tipoActividadSeguimiento === "final" ? "final" : "parcial";
    const fecha = body.fecha ? new Date(body.fecha) : new Date();
    const snap = await snapshotEstudianteMonitor(po, postulacionId, req);

    const sup = await SupervisionPractica.create({
      postulacionOportunidad: postulacionId,
      tipoActividadSeguimiento: tipo,
      seguimientoPlanItemId: body.seguimientoPlanItemId && mongoose.Types.ObjectId.isValid(String(body.seguimientoPlanItemId))
        ? body.seguimientoPlanItemId
        : null,
      fecha,
      tipoSeguimientoMedio: (body.tipoSeguimientoMedio || "Medio electrónico").toString().trim(),
      productoOInforme: (body.productoOInforme || "").toString().trim(),
      ponderacionPorcentaje: body.ponderacionPorcentaje != null ? Number(body.ponderacionPorcentaje) : 0,
      nota: body.nota != null ? Number(body.nota) : null,
      aprueba: Boolean(body.aprueba),
      observaciones: body.aprueba ? String(body.observaciones || "").trim().slice(0, 10000) : String(body.observaciones || "").trim().slice(0, 10000),
      ...snap,
      estado: "borrador",
      creadoPor: req.user?.id ?? null,
    });

    const populated = await SupervisionPractica.findById(sup._id).populate("creadoPor", "name email").lean();
    res.status(201).json({ supervision: populated });
  } catch (err) {
    console.error("[SupervisionPractica] createSupervisionPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function updateSupervisionPractica(req, res) {
  try {
    const { postulacionId, supervisionId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const can = await puedeActuarComoMonitor(req, po);
    if (!can) return res.status(403).json({ message: "No autorizado." });

    const sup = await SupervisionPractica.findOne({ _id: supervisionId, postulacionOportunidad: postulacionId });
    if (!sup) return res.status(404).json({ message: "No encontrado" });
    if (sup.estado !== "borrador") return res.status(400).json({ message: "Solo se edita en borrador." });

    const body = req.body || {};
    if (body.fecha !== undefined) sup.fecha = new Date(body.fecha);
    if (body.tipoActividadSeguimiento !== undefined) sup.tipoActividadSeguimiento = body.tipoActividadSeguimiento === "final" ? "final" : "parcial";
    if (body.productoOInforme !== undefined) sup.productoOInforme = String(body.productoOInforme || "").trim();
    if (body.ponderacionPorcentaje !== undefined) sup.ponderacionPorcentaje = Number(body.ponderacionPorcentaje);
    if (body.nota !== undefined) sup.nota = body.nota != null ? Number(body.nota) : null;
    if (body.aprueba !== undefined) sup.aprueba = Boolean(body.aprueba);
    if (body.observaciones !== undefined) sup.observaciones = String(body.observaciones || "").trim().slice(0, 10000);
    if (body.tipoSeguimientoMedio !== undefined) sup.tipoSeguimientoMedio = String(body.tipoSeguimientoMedio || "").trim();

    const snap = await snapshotEstudianteMonitor(po, postulacionId, req);
    Object.assign(sup, snap);
    sup.actualizadoPor = req.user?.id ?? null;
    await sup.save();

    const updated = await SupervisionPractica.findById(sup._id).populate("creadoPor", "name email").lean();
    res.json({ supervision: updated });
  } catch (err) {
    console.error("[SupervisionPractica] updateSupervisionPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function deleteSupervisionPractica(req, res) {
  try {
    const { postulacionId, supervisionId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const can = await puedeActuarComoMonitor(req, po);
    if (!can) return res.status(403).json({ message: "No autorizado." });

    const sup = await SupervisionPractica.findOne({ _id: supervisionId, postulacionOportunidad: postulacionId });
    if (!sup) return res.status(404).json({ message: "No encontrado" });
    if (sup.estado !== "borrador") return res.status(400).json({ message: "Solo se elimina en borrador." });

    for (const d of sup.documentos || []) {
      if (d?.key) {
        try {
          await deleteFromS3(d.key);
        } catch (_) {
          /* ignore */
        }
      }
    }
    if (sup.pdfS3Key) {
      try {
        await deleteFromS3(sup.pdfS3Key);
      } catch (_) {
        /* ignore */
      }
    }
    await SupervisionPractica.deleteOne({ _id: supervisionId });
    res.json({ message: "Eliminado" });
  } catch (err) {
    console.error("[SupervisionPractica] deleteSupervisionPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postEnviarFirmasSupervisionPractica(req, res) {
  try {
    const { postulacionId, supervisionId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const can = await puedeActuarComoMonitor(req, po);
    if (!can) return res.status(403).json({ message: "No autorizado." });

    const sup = await SupervisionPractica.findOne({ _id: supervisionId, postulacionOportunidad: postulacionId });
    if (!sup) return res.status(404).json({ message: "No encontrado" });
    if (sup.estado !== "borrador") return res.status(400).json({ message: "Solo se envía a firmas desde borrador." });

    const opp = po.opportunity;
    const tutor = resolveTutorPractica(opp, postulacionId);
    const estEmail = normalizeEmail(sup.emailEstudiante);
    const monEmail = normalizeEmail(sup.monitorEmail || opp?.creadoPor?.email);
    const tutEmail = tutor.email && tutor.email !== "—" ? normalizeEmail(tutor.email) : "";

    if (!isValidEmail(estEmail) || !isValidEmail(monEmail) || !isValidEmail(tutEmail)) {
      return res.status(400).json({ message: "Faltan correos válidos de estudiante, monitor o tutor." });
    }

    sup.emailsFirma = { estudiante: estEmail, monitor: monEmail, tutor: tutEmail };
    sup.firmas = {
      estudiante: { estado: "pendiente", fecha: null, usuario: null, ip: null },
      monitor: { estado: "pendiente", fecha: null, usuario: null, ip: null },
      tutor: { estado: "pendiente", fecha: null, usuario: null, ip: null },
    };
    sup.estado = "pendiente_firmas";
    sup.enviadoFirmasAt = new Date();
    await sup.save();

    res.json({ supervision: await SupervisionPractica.findById(sup._id).lean(), message: "Enviado a firmas." });
  } catch (err) {
    console.error("[SupervisionPractica] postEnviarFirmasSupervisionPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postFirmarSupervisionPractica(req, res) {
  try {
    const { postulacionId, supervisionId } = req.params;
    const { rol } = req.body || {};
    if (!["estudiante", "monitor", "tutor"].includes(rol)) {
      return res.status(400).json({ message: "Indique rol: estudiante, monitor o tutor." });
    }

    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const sup = await SupervisionPractica.findOne({ _id: supervisionId, postulacionOportunidad: postulacionId });
    if (!sup) return res.status(404).json({ message: "No encontrado" });
    if (sup.estado !== "pendiente_firmas") return res.status(400).json({ message: "No está en espera de firmas." });

    const user = await User.findById(req.user?.id).select("email").lean();
    const email = normalizeEmail(user?.email);
    if (!email) return res.status(403).json({ message: "Usuario sin correo." });

    const expected = sup.emailsFirma[rol];
    let allowed = false;

    if (rol === "estudiante") {
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(403).json({ message: "Solo el estudiante puede firmar aquí." });
      allowed = emailsMatch(email, expected);
    } else if (userIsAdminLike(req)) {
      allowed = true;
    } else {
      allowed = emailsMatch(email, expected);
    }

    if (!allowed) return res.status(403).json({ message: "No autorizado para esta firma." });

    const slot = sup.firmas[rol];
    if (slot.estado === "aprobado") return res.status(400).json({ message: "Firma ya registrada." });

    slot.estado = "aprobado";
    slot.fecha = new Date();
    slot.usuario = req.user?.id || null;
    slot.ip = getClientIp(req);
    sup.markModified("firmas");

    const allOk =
      sup.firmas.estudiante.estado === "aprobado" &&
      sup.firmas.monitor.estado === "aprobado" &&
      sup.firmas.tutor.estado === "aprobado";

    if (allOk) {
      sup.firmasCompletasAt = new Date();
      const key = await generarPdfYGuardar(sup);
      sup.pdfS3Key = key;
      sup.pdfGeneradoAt = new Date();
      sup.estado = "cerrado";
      await sup.save();
      await recalcularNotaDefinitivaPlan(postulacionId);
    } else {
      await sup.save();
    }

    const out = await SupervisionPractica.findById(sup._id).lean();
    res.json({
      supervision: out,
      message: allOk ? "Firmas completas. PDF generado." : "Firma registrada.",
    });
  } catch (err) {
    console.error("[SupervisionPractica] postFirmarSupervisionPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getPdfSupervisionPracticaUrl(req, res) {
  try {
    const { postulacionId, supervisionId } = req.params;
    const isStudent = userRoleEffective(req) === "student";

    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    if (isStudent) {
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(r.error).json({ message: r.message });
    } else {
      const po = await loadPostulacionContext(postulacionId);
      if (!po) return res.status(404).json({ message: "No encontrado" });
      const can = await puedeActuarComoMonitor(req, po);
      if (!can && !userIsAdminLike(req)) return res.status(403).json({ message: "No autorizado." });
    }

    const sup = await SupervisionPractica.findOne({ _id: supervisionId, postulacionOportunidad: postulacionId }).lean();
    if (!sup?.pdfS3Key) return res.status(404).json({ message: "PDF no disponible aún." });

    const url = await getSignedDownloadUrl(sup.pdfS3Key, 3600, {
      responseContentDisposition: 'inline; filename="supervision-practica.pdf"',
      responseContentType: "application/pdf",
    });
    res.json({ url });
  } catch (err) {
    console.error("[SupervisionPractica] getPdfSupervisionPracticaUrl:", err);
    res.status(500).json({ message: err.message });
  }
}

const MIME_EXT = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function extFromFile(file) {
  const orig = (file.originalname || "").toLowerCase();
  const dot = orig.lastIndexOf(".");
  if (dot >= 0) {
    const ext = orig.slice(dot);
    if (/^\.[a-z0-9]{1,10}$/i.test(ext)) return ext.toLowerCase();
  }
  return MIME_EXT[file.mimetype] ? `.${MIME_EXT[file.mimetype]}` : ".pdf";
}

export async function uploadDocumentoSupervisionPractica(req, res) {
  try {
    const { postulacionId, supervisionId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const po = await loadPostulacionContext(postulacionId);
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });

    const sup = await SupervisionPractica.findOne({ _id: supervisionId, postulacionOportunidad: postulacionId });
    if (!sup) return res.status(404).json({ message: "No encontrado" });

    const isStudent = userRoleEffective(req) === "student";
    const origen = req.body?.origen === "estudiante_post_firma" ? "estudiante_post_firma" : "monitor";

    if (origen === "estudiante_post_firma") {
      if (!isStudent) return res.status(403).json({ message: "Solo el estudiante." });
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(r.error).json({ message: r.message });
      if (sup.estado !== "cerrado") {
        return res.status(400).json({ message: "El cargue del estudiante está habilitado tras completar firmas y generar el PDF." });
      }
    } else {
      const can = await puedeActuarComoMonitor(req, po);
      if (!can) return res.status(403).json({ message: "No autorizado." });
      if (sup.estado !== "borrador" && sup.estado !== "pendiente_firmas") {
        return res.status(400).json({ message: "No puede adjuntar en el estado actual." });
      }
    }

    if (!req.file?.buffer) return res.status(400).json({ message: "Archivo requerido." });

    const docId = new mongoose.Types.ObjectId();
    const key = `${S3_PREFIX}/docs/${postulacionId}/${supervisionId}/${docId}${extFromFile(req.file)}`;
    await uploadToS3(key, req.file.buffer, { contentType: req.file.mimetype || "application/octet-stream" });

    if (!Array.isArray(sup.documentos)) sup.documentos = [];
    sup.documentos.push({
      _id: docId,
      key,
      originalName: req.file.originalname || "adjunto",
      contentType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
      origen,
    });
    await sup.save();

    res.json({ supervision: await SupervisionPractica.findById(sup._id).lean() });
  } catch (err) {
    console.error("[SupervisionPractica] uploadDocumentoSupervisionPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getDocumentoSupervisionPracticaUrl(req, res) {
  try {
    const { postulacionId, supervisionId, documentoId } = req.params;
    const ok = await assertSupervisionHabilitada(postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const sup = await SupervisionPractica.findOne({ _id: supervisionId, postulacionOportunidad: postulacionId }).lean();
    if (!sup) return res.status(404).json({ message: "No encontrado" });

    if (userRoleEffective(req) === "student") {
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(r.error).json({ message: r.message });
    } else {
      const po = await loadPostulacionContext(postulacionId);
      if (!po) return res.status(404).json({ message: "No encontrado" });
      const canMon = await puedeActuarComoMonitor(req, po);
      if (!canMon && !userIsAdminLike(req)) {
        const tutor = resolveTutorPractica(po.opportunity, postulacionId);
        const u = await User.findById(req.user?.id).select("email").lean();
        const em = normalizeEmail(u?.email);
        const tutEmail = tutor?.email && tutor.email !== "—" ? normalizeEmail(tutor.email) : "";
        if (!em || em !== tutEmail) return res.status(403).json({ message: "No autorizado." });
      }
    }
    const doc = (sup.documentos || []).find((d) => String(d._id) === String(documentoId));
    if (!doc?.key) return res.status(404).json({ message: "Documento no encontrado" });

    const url = await getSignedDownloadUrl(doc.key, 3600, {
      responseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName || "documento")}`,
      responseContentType: doc.contentType || "application/octet-stream",
    });
    res.json({ url });
  } catch (err) {
    console.error("[SupervisionPractica] getDocumentoSupervisionPracticaUrl:", err);
    res.status(500).json({ message: err.message });
  }
}
