/**
 * RQ04_HU010 — Certificación práctica/pasantía (cargue entidad o coordinación).
 */
import crypto from "crypto";
import LegalizacionPractica from "../legalizacionPractica/legalizacionPractica.model.js";
import PlanPractica from "../legalizacionPractica/planPractica.model.js";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";
import CertificacionPractica from "./certificacionPractica.model.js";
import { uploadToS3, deleteFromS3, getSignedDownloadUrl } from "../../config/s3.config.js";
import { getPostulacionAceptadaEstudiante } from "../legalizacionPractica/legalizacionPractica.controller.js";
import { mapModuloToRole } from "../../middlewares/auth.js";
import {
  dispatchPracticaNotification,
  entityAndCoordinatorsRecipientContext,
  loadPracticaPostulacionContext,
  studentOnlyRecipientContext,
} from "../notificacion/application/practicaOpportunityNotifications.helper.js";

const S3_PREFIX = "certificaciones-practica";

function diasLimiteDefault() {
  const n = parseInt(process.env.CERTIFICACION_DIAS_LIMITE_CARGA || "15", 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function userRoleEffective(req) {
  return req.user?.role || mapModuloToRole(req.user?.modulo);
}

function userIsAdminLike(req) {
  return ["admin", "superadmin", "leader"].includes(userRoleEffective(req));
}

function normalizeEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + Number(days));
  return x;
}

async function assertCertificacionHabilitada(postulacionId) {
  const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
  if (!leg || leg.estado !== "aprobada") {
    return { error: 400, message: "La legalización debe estar aprobada." };
  }
  const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
  if (!plan || plan.estado !== "aprobado") {
    return { error: 400, message: "El plan de práctica debe estar aprobado." };
  }
  if (!plan.supervisionInformesCompleto) {
    return { error: 400, message: "Debe completar el seguimiento de supervisión antes de certificación." };
  }
  return { ok: true };
}

async function applyVencimientoIfNeeded(certDoc) {
  if (!certDoc || certDoc.estado === "cargada" || certDoc.estado === "vencida_sin_carga") return;
  if (
    certDoc.fechaLimiteCarga &&
    new Date() > new Date(certDoc.fechaLimiteCarga) &&
    certDoc.estado === "pendiente_carga"
  ) {
    certDoc.estado = "vencida_sin_carga";
    await certDoc.save();
  }
}

export async function getCertificacionPorPostulacion(req, res) {
  try {
    const { postulacionId } = req.params;
    const chk = await assertCertificacionHabilitada(postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });

    const isStudent = userRoleEffective(req) === "student";
    if (isStudent) {
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(r.error).json({ message: r.message });
    } else if (!userIsAdminLike(req)) {
      return res.status(403).json({ message: "No autorizado." });
    }

    const certDoc = await CertificacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (certDoc) await applyVencimientoIfNeeded(certDoc);
    const cert = await CertificacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    const baseUrl = (process.env.FRONTEND_BASE_URL || "").replace(/\/$/, "") || "http://localhost:5173";
    const linkEntidad = cert?.tokenCargaEntidad ? `${baseUrl}/#/certificacion-practica/${cert.tokenCargaEntidad}` : null;

    res.json({ certificacion: cert, linkCargaEntidad: linkEntidad });
  } catch (err) {
    console.error("[CertPractica] getCertificacionPorPostulacion:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postInicializarCertificacion(req, res) {
  try {
    const { postulacionId } = req.params;
    const chk = await assertCertificacionHabilitada(postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });
    if (!userIsAdminLike(req)) return res.status(403).json({ message: "Solo coordinación." });

    const po = await PostulacionOportunidad.findById(postulacionId)
      .populate({ path: "opportunity", populate: { path: "company" } })
      .populate("postulantProfile")
      .lean();
    if (!po?.opportunity) return res.status(404).json({ message: "Postulación no encontrada" });

    const fin = po.opportunity.fechaFinPractica ? new Date(po.opportunity.fechaFinPractica) : null;
    if (fin && new Date() < fin) {
      return res.status(400).json({ message: "La solicitud de certificación aplica cuando la práctica ha finalizado (fecha fin)." });
    }

    const dias = req.body?.diasLimiteCarga != null ? Number(req.body.diasLimiteCarga) : diasLimiteDefault();
    const fechaBase = fin || new Date();
    const fechaLimite = addDays(fechaBase, dias);

    let cert = await CertificacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (cert?.documento?.key) {
      return res.status(400).json({ message: "Ya existe certificación cargada." });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const profileId = po.postulantProfile?._id ?? po.postulantProfile;

    if (!cert) {
      cert = await CertificacionPractica.create({
        postulacionOportunidad: postulacionId,
        postulantProfileId: profileId || null,
        estado: "pendiente_carga",
        fechaFinPractica: fin,
        diasLimiteCarga: dias,
        fechaLimiteCarga: fechaLimite,
        tokenCargaEntidad: token,
        solicitudEnviadaAt: new Date(),
        creadoPor: req.user?.id ?? null,
      });
    } else {
      cert.estado = "pendiente_carga";
      cert.fechaFinPractica = fin;
      cert.diasLimiteCarga = dias;
      cert.fechaLimiteCarga = fechaLimite;
      cert.tokenCargaEntidad = token;
      cert.solicitudEnviadaAt = new Date();
      await cert.save();
    }

    const ctx = await loadPracticaPostulacionContext(postulacionId);
    if (ctx) {
      const company = ctx.po?.opportunity?.company;
      const emailContacto =
        company?.contacts?.map((c) => c?.email).find((e) => e && String(e).trim()) ||
        company?.contact?.email ||
        company?.email ||
        "";
      const datos = {
        ...ctx.datos,
        LINK_CERTIFICACION: `${(process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/$/, "")}/#/certificacion-practica/${token}`,
      };
      const rec = entityAndCoordinatorsRecipientContext(ctx.creadorEmail);
      if (emailContacto) rec.contacto_entidad = String(emailContacto).trim();
      await dispatchPracticaNotification("solicitud_certificacion_practica", datos, rec, { postulacionId });
    }

    const out = await CertificacionPractica.findById(cert._id).lean();
    res.status(201).json({ certificacion: out });
  } catch (err) {
    console.error("[CertPractica] postInicializarCertificacion:", err);
    res.status(500).json({ message: err.message });
  }
}

async function guardarDocumento(cert, file, origen) {
  if (cert.documento?.key) {
    try {
      await deleteFromS3(cert.documento.key);
    } catch (_) {
      /* ignore */
    }
  }
  const ext = (file.originalname || "").includes(".") ? file.originalname.slice(file.originalname.lastIndexOf(".")) : ".pdf";
  const key = `${S3_PREFIX}/docs/${cert.postulacionOportunidad}/${Date.now()}${ext}`;
  await uploadToS3(key, file.buffer, { contentType: file.mimetype || "application/octet-stream" });
  cert.documento = {
    key,
    originalName: file.originalname || "certificacion",
    contentType: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
    origen,
  };
  cert.estado = "cargada";
  await cert.save();
}

export async function postDocumentoCertificacion(req, res) {
  try {
    const { postulacionId } = req.params;
    if (!userIsAdminLike(req)) return res.status(403).json({ message: "Solo coordinación." });
    const chk = await assertCertificacionHabilitada(postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });

    const cert = await CertificacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!cert) return res.status(404).json({ message: "Inicialice la certificación primero." });
    if (!req.file?.buffer) return res.status(400).json({ message: "Archivo requerido." });

    await guardarDocumento(cert, req.file, "coordinacion");

    const ctx = await loadPracticaPostulacionContext(postulacionId);
    if (ctx) {
      await dispatchPracticaNotification(
        "solicitud_certificacion_practica",
        { ...ctx.datos, OBSERVACION: "Certificación cargada por coordinación." },
        { ...studentOnlyRecipientContext(ctx.postulantEmail), ...entityAndCoordinatorsRecipientContext(ctx.creadorEmail) },
        { postulacionId, tipo: "certificacion_cargada" }
      );
    }

    res.json({ certificacion: await CertificacionPractica.findById(cert._id).lean() });
  } catch (err) {
    console.error("[CertPractica] postDocumentoCertificacion:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getPublicCertificacionInfo(req, res) {
  try {
    const { token } = req.params;
    const cert = await CertificacionPractica.findOne({ tokenCargaEntidad: token })
      .populate({ path: "postulacionOportunidad", populate: { path: "opportunity", populate: { path: "company", select: "name commercialName" } } })
      .lean();
    if (!cert) return res.status(404).json({ message: "Enlace inválido." });

    const po = cert.postulacionOportunidad;
    const empresa = po?.opportunity?.company?.commercialName || po?.opportunity?.company?.name || "—";
    const cargo = po?.opportunity?.nombreCargo || "—";

    res.json({
      empresa,
      cargo,
      estado: cert.estado,
      fechaLimiteCarga: cert.fechaLimiteCarga,
      yaCargado: Boolean(cert.documento?.key),
    });
  } catch (err) {
    console.error("[CertPractica] getPublicCertificacionInfo:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postPublicCertificacionDocumento(req, res) {
  try {
    const { token } = req.params;
    const cert = await CertificacionPractica.findOne({ tokenCargaEntidad: token });
    if (!cert) return res.status(404).json({ message: "Enlace inválido." });
    if (cert.estado === "cargada" && cert.documento?.key) {
      return res.status(400).json({ message: "Ya se cargó un documento." });
    }
    await applyVencimientoIfNeeded(cert);
    if (cert.estado === "vencida_sin_carga") {
      return res.status(400).json({ message: "Plazo vencido. Contacte a la universidad." });
    }
    if (!req.file?.buffer) return res.status(400).json({ message: "Archivo requerido." });

    await guardarDocumento(cert, req.file, "entidad");

    const ctx = await loadPracticaPostulacionContext(String(cert.postulacionOportunidad));
    if (ctx) {
      await dispatchPracticaNotification(
        "solicitud_certificacion_practica",
        { ...ctx.datos, OBSERVACION: "La entidad cargó la certificación de práctica." },
        { ...studentOnlyRecipientContext(ctx.postulantEmail), ...entityAndCoordinatorsRecipientContext(ctx.creadorEmail) },
        { postulacionId: String(cert.postulacionOportunidad), tipo: "certificacion_entidad" }
      );
    }

    res.json({ ok: true, mensaje: "Certificación recibida. Gracias." });
  } catch (err) {
    console.error("[CertPractica] postPublicCertificacionDocumento:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getDocumentoCertificacionUrl(req, res) {
  try {
    const { postulacionId } = req.params;
    const chk = await assertCertificacionHabilitada(postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });

    const isStudent = userRoleEffective(req) === "student";
    if (isStudent) {
      const r = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (r.error) return res.status(r.error).json({ message: r.message });
    } else if (!userIsAdminLike(req)) {
      return res.status(403).json({ message: "No autorizado." });
    }

    const cert = await CertificacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!cert?.documento?.key) return res.status(404).json({ message: "Sin documento." });
    const url = await getSignedDownloadUrl(cert.documento.key, 3600, {
      responseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(cert.documento.originalName || "certificacion.pdf")}`,
      responseContentType: cert.documento.contentType || "application/pdf",
    });
    res.json({ url });
  } catch (err) {
    console.error("[CertPractica] getDocumentoCertificacionUrl:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function patchVinculacionLaboral(req, res) {
  try {
    const { postulacionId } = req.params;
    if (!userIsAdminLike(req)) return res.status(403).json({ message: "Solo coordinación." });
    const chk = await assertCertificacionHabilitada(postulacionId);
    if (chk.error) return res.status(chk.error).json({ message: chk.message });

    const cert = await CertificacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!cert) return res.status(404).json({ message: "Sin registro de certificación." });

    cert.vinculacionLaboral = Boolean(req.body?.vinculacionLaboral);
    cert.vinculacionLaboralAt = cert.vinculacionLaboral ? new Date() : null;
    cert.vinculacionLaboralPor = cert.vinculacionLaboral ? req.user?.id ?? null : null;
    await cert.save();

    res.json({ certificacion: await CertificacionPractica.findById(cert._id).lean() });
  } catch (err) {
    console.error("[CertPractica] patchVinculacionLaboral:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getAdminEstadisticasCertificacion(req, res) {
  try {
    const total = await CertificacionPractica.countDocuments();
    const cargadas = await CertificacionPractica.countDocuments({ estado: "cargada" });
    const pendientes = await CertificacionPractica.countDocuments({ estado: "pendiente_carga" });
    const vencidas = await CertificacionPractica.countDocuments({ estado: "vencida_sin_carga" });
    res.json({ total, cargadas, pendientes, vencidas });
  } catch (err) {
    console.error("[CertPractica] getAdminEstadisticasCertificacion:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getAdminReporteCsvCertificacion(req, res) {
  try {
    const list = await CertificacionPractica.find()
      .populate("postulacionOportunidad")
      .sort({ updatedAt: -1 })
      .lean();

    const esc = (s) => {
      const x = String(s ?? "").replace(/"/g, '""');
      return `"${x}"`;
    };
    const lines = [["postulacionId", "estado", "fechaFinPractica", "fechaLimiteCarga", "vinculacionLaboral", "origenDoc", "uploadedAt"].join(",")];

    for (const row of list) {
      lines.push(
        [
          esc(row.postulacionOportunidad?._id),
          esc(row.estado),
          esc(row.fechaFinPractica),
          esc(row.fechaLimiteCarga),
          esc(row.vinculacionLaboral ? "Sí" : "No"),
          esc(row.documento?.origen),
          esc(row.documento?.uploadedAt),
        ].join(",")
      );
    }

    const csv = "\uFEFF" + lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="certificaciones-practica-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[CertPractica] getAdminReporteCsvCertificacion:", err);
    res.status(500).json({ message: err.message });
  }
}
