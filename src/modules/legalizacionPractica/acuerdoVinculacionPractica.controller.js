/**
 * Acuerdo de vinculación práctica (RQ04_HU006): emisión con PDF en S3, tres firmas por token público.
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";
import AcuerdoVinculacionPractica from "./acuerdoVinculacionPractica.model.js";
import LegalizacionPractica from "./legalizacionPractica.model.js";
import {
  getPostulacionAceptadaEstudiante,
  assertAdminLegalizacionAccess,
} from "./legalizacionPractica.controller.js";
import { esAcuerdoDeVinculacion, buildAcuerdoVinculacionPdfDataFromPostulacion } from "../../services/acuerdoVinculacion.service.js";
import { buildRegistroFirmasRows } from "../../services/acuerdoVinculacionFirmas.util.js";
import { buildAcuerdoVinculacionPdf } from "../../services/acuerdoVinculacionPdf.service.js";
import { uploadToS3, getObjectFromS3, deleteFromS3 } from "../../config/s3.config.js";
import User from "../users/user.model.js";
import { mapModuloToRole } from "../../middlewares/auth.js";

const S3_PREFIX = "acuerdos-vinculacion-practica";

function isValidObjectId24(id) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}

function isLoopbackIp(ip) {
  if (!ip || typeof ip !== "string") return true;
  const t = ip.trim().replace(/^::ffff:/i, "");
  if (t === "::1" || t === "127.0.0.1" || t === "localhost") return true;
  if (t.startsWith("127.")) return true;
  return false;
}

/** IP del cliente: prioriza X-Forwarded-For / X-Real-IP (requiere trust proxy en el servidor). */
function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    const parts = xf.split(",").map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (p && !isLoopbackIp(p)) return p.slice(0, 64);
    }
    if (parts[0]) return parts[0].slice(0, 64);
  }
  for (const h of ["x-real-ip", "cf-connecting-ip", "true-client-ip"]) {
    const v = req.headers[h];
    if (typeof v === "string" && v.trim()) {
      const t = v.trim();
      if (!isLoopbackIp(t)) return t.slice(0, 64);
    }
  }
  const raw = String(req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || "")
    .replace(/^::ffff:/i, "")
    .trim();
  if (raw) return raw.slice(0, 64);
  return null;
}

async function emailsPorUsuarioFirmas(firmas) {
  const ids = [];
  for (const k of ["practicante", "escenario", "universidad"]) {
    const u = firmas?.[k]?.usuario;
    if (u) ids.push(u);
  }
  const uniq = [...new Set(ids.map((x) => String(x)))];
  if (!uniq.length) return {};
  const users = await User.find({ _id: { $in: uniq } }).select("email").lean();
  return Object.fromEntries(users.map((u) => [String(u._id), u.email]));
}

/** Sube de nuevo el PDF en S3 con la tabla de firmas actual (misma clave). */
async function regenerarPdfSnapshotAcuerdo(acuerdoId) {
  const acuerdo = await AcuerdoVinculacionPractica.findById(acuerdoId);
  if (!acuerdo?.pdfSnapshotS3Key) return;
  const built = await buildAcuerdoVinculacionPdfDataFromPostulacion(acuerdo.postulacionOportunidad);
  if (!built.ok) throw new Error(built.message || "No se pudo armar datos del PDF");
  const emailById = await emailsPorUsuarioFirmas(acuerdo.firmas);
  const registroFirmas = buildRegistroFirmasRows(acuerdo.firmas, built.payload, emailById);
  const pdfBuffer = await buildAcuerdoVinculacionPdf({ ...built.payload, registroFirmas });
  await uploadToS3(acuerdo.pdfSnapshotS3Key, pdfBuffer, { contentType: "application/pdf" });
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function publicBaseUrl() {
  return (process.env.FRONTEND_PUBLIC_URL || "http://localhost:5173").replace(/\/$/, "");
}

function firmaLinks(tokens) {
  const base = publicBaseUrl();
  return {
    practicante: `${base}/#/firma-acuerdo-practica/${encodeURIComponent(tokens.practicante)}`,
    escenario: `${base}/#/firma-acuerdo-practica/${encodeURIComponent(tokens.escenario)}`,
    universidad: `${base}/#/firma-acuerdo-practica/${encodeURIComponent(tokens.universidad)}`,
  };
}

/** Coordinación ve los 3 enlaces; estudiante/postulante solo el suyo. `assertAdminLegalizacionAccess` no valida rol. */
function puedeVerTodosEnlacesAcuerdo(req) {
  const role = req.user?.role || mapModuloToRole(req.user?.modulo);
  return ["admin", "superadmin", "leader"].includes(role);
}

/** Estudiante: solo su enlace. Coordinación: los tres. */
function filtrarEnlacesPorRol(enlacesCompletos, alcance) {
  if (alcance === "solo_practicante") {
    return { practicante: enlacesCompletos.practicante };
  }
  return enlacesCompletos;
}

function tryUserIdFromAuth(req) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (!authHeader || !process.env.JWT_SECRET) return null;
  try {
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id || null;
  } catch {
    return null;
  }
}

async function findAcuerdoByToken(token) {
  if (!token || String(token).length < 16) return null;
  const t = decodeURIComponent(String(token).trim());
  return AcuerdoVinculacionPractica.findOne({
    estado: "pendiente_firmas",
    $or: [{ tokenPracticante: t }, { tokenEscenario: t }, { tokenUniversidad: t }],
  }).lean();
}

function rolFromToken(doc, token) {
  const t = decodeURIComponent(String(token).trim());
  if (doc.tokenPracticante === t) return "practicante";
  if (doc.tokenEscenario === t) return "escenario";
  if (doc.tokenUniversidad === t) return "universidad";
  return null;
}

async function syncLegalizacionTresFirmas(postulacionId, value) {
  await LegalizacionPractica.updateOne(
    { postulacionOportunidad: postulacionId },
    { $set: { acuerdoTresFirmasCompletas: Boolean(value) } }
  );
}

/** POST estudiante: emite acuerdo (PDF snapshot S3 + tokens). */
export const postEmitirAcuerdoVinculacionPractica = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const opp = result.po?.opportunity;
    if (!esAcuerdoDeVinculacion(opp?.tipoVinculacion)) {
      return res.status(400).json({
        message: "Solo puede emitir acuerdo cuando el tipo de vinculación es «Acuerdo de vinculación».",
      });
    }

    const existing = await AcuerdoVinculacionPractica.findOne({ postulacionOportunidad: postulacionId });
    if (existing?.estado === "pendiente_firmas") {
      const enlaces = firmaLinks({
        practicante: existing.tokenPracticante,
        escenario: existing.tokenEscenario,
        universidad: existing.tokenUniversidad,
      });
      return res.status(409).json({
        message:
          "Ya existe un acuerdo pendiente de firmas. Use su enlace de practicante; escenario y universidad los gestiona coordinación.",
        acuerdoId: existing._id,
        enlaces: filtrarEnlacesPorRol(enlaces, "solo_practicante"),
      });
    }
    if (existing?.estado === "aprobado") {
      return res.status(409).json({ message: "El acuerdo ya fue aprobado por las tres partes." });
    }

    const built = await buildAcuerdoVinculacionPdfDataFromPostulacion(postulacionId);
    if (!built.ok) return res.status(400).json({ message: built.message || "No se pudo armar el PDF" });
    const pdfBuffer = await buildAcuerdoVinculacionPdf(built.payload);

    const _id = new mongoose.Types.ObjectId();
    const key = `${S3_PREFIX}/${_id}.pdf`;
    await uploadToS3(key, pdfBuffer, { contentType: "application/pdf" });

    const tokens = {
      practicante: randomToken(),
      escenario: randomToken(),
      universidad: randomToken(),
    };

    let doc;
    if (existing && existing.estado === "rechazado") {
      if (existing.pdfSnapshotS3Key) {
        try {
          await deleteFromS3(existing.pdfSnapshotS3Key);
        } catch {
          /* ignore */
        }
      }
      doc = await AcuerdoVinculacionPractica.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            estado: "pendiente_firmas",
            creador: req.user?.id,
            pdfSnapshotS3Key: key,
            tokenPracticante: tokens.practicante,
            tokenEscenario: tokens.escenario,
            tokenUniversidad: tokens.universidad,
            firmas: {
              practicante: { estado: "pendiente", fecha: null, ip: null, usuario: null, motivoRechazo: null },
              escenario: { estado: "pendiente", fecha: null, ip: null, usuario: null, motivoRechazo: null },
              universidad: { estado: "pendiente", fecha: null, ip: null, usuario: null, motivoRechazo: null },
            },
          },
          $inc: { version: 1 },
        },
        { new: true }
      ).lean();
      await syncLegalizacionTresFirmas(postulacionId, false);
    } else {
      doc = await AcuerdoVinculacionPractica.create({
        _id,
        postulacionOportunidad: postulacionId,
        estado: "pendiente_firmas",
        creador: req.user?.id,
        pdfSnapshotS3Key: key,
        tokenPracticante: tokens.practicante,
        tokenEscenario: tokens.escenario,
        tokenUniversidad: tokens.universidad,
        firmas: {
          practicante: { estado: "pendiente" },
          escenario: { estado: "pendiente" },
          universidad: { estado: "pendiente" },
        },
      });
      doc = doc.toObject();
    }

    const enlacesCompletos = firmaLinks(tokens);
    res.status(201).json({
      message:
        "Acuerdo generado. Aquí tiene su enlace como practicante; los enlaces de escenario y universidad los comparte coordinación con cada parte.",
      acuerdo: {
        _id: doc._id,
        estado: doc.estado,
        version: doc.version,
        createdAt: doc.createdAt,
        firmas: doc.firmas,
      },
      enlaces: filtrarEnlacesPorRol(enlacesCompletos, "solo_practicante"),
    });
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) {
      return res.status(503).json({ message: "Almacenamiento no disponible para guardar el PDF" });
    }
    console.error("[AcuerdoVinculacionPractica] postEmitir:", err);
    res.status(500).json({ message: err.message });
  }
};

function serializeAcuerdoForClient(doc, includeTokens, alcanceEnlaces = "todos") {
  if (!doc) return null;
  let enlaces;
  if (includeTokens) {
    const completos = firmaLinks({
      practicante: doc.tokenPracticante,
      escenario: doc.tokenEscenario,
      universidad: doc.tokenUniversidad,
    });
    enlaces = filtrarEnlacesPorRol(completos, alcanceEnlaces);
  }
  return {
    _id: doc._id,
    estado: doc.estado,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    firmas: doc.firmas,
    ...(enlaces ? { enlaces } : {}),
  };
}

/** GET estudiante/admin: estado y enlaces (con token solo titular o coordinación). */
export const getEstadoAcuerdoVinculacionPractica = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    if (!isValidObjectId24(postulacionId)) return res.status(400).json({ message: "ID no válido" });

    const studentTry = await getPostulacionAceptadaEstudiante(req, postulacionId);
    const adminTry = await assertAdminLegalizacionAccess(req, postulacionId);
    if (studentTry.error && adminTry.error) {
      const code =
        studentTry.error === 401 || adminTry.error === 401 ? 401 : studentTry.error === 403 || adminTry.error === 403 ? 403 : 404;
      return res.status(code).json({ message: "No autorizado" });
    }

    const doc = await AcuerdoVinculacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!doc) return res.json({ acuerdo: null });

    const alcanceEnlaces = puedeVerTodosEnlacesAcuerdo(req) ? "todos" : "solo_practicante";
    res.json({ acuerdo: serializeAcuerdoForClient(doc, true, alcanceEnlaces) });
  } catch (err) {
    console.error("[AcuerdoVinculacionPractica] getEstado:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET estudiante/admin: PDF emitido (snapshot S3). */
export const getPdfAcuerdoEmitido = async (req, res) => {
  try {
    const { postulacionId } = req.params;
    if (!isValidObjectId24(postulacionId)) return res.status(400).json({ message: "ID no válido" });

    const st = await getPostulacionAceptadaEstudiante(req, postulacionId);
    const ad = await assertAdminLegalizacionAccess(req, postulacionId);
    if (st.error && ad.error) {
      const code = st.error === 401 || ad.error === 401 ? 401 : 403;
      return res.status(code).json({ message: "No autorizado" });
    }

    const acuerdo = await AcuerdoVinculacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!acuerdo?.pdfSnapshotS3Key) return res.status(404).json({ message: "No hay acuerdo emitido aún" });

    const { body, contentType } = await getObjectFromS3(acuerdo.pdfSnapshotS3Key);
    res.setHeader("Content-Type", contentType || "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="acuerdo-vinculacion-emitido.pdf"');
    res.send(body);
  } catch (err) {
    if (err.message?.includes("S3 no está configurado")) return res.status(503).json({ message: "Almacenamiento no disponible" });
    console.error("[AcuerdoVinculacionPractica] getPdfEmitido:", err);
    res.status(500).json({ message: err.message });
  }
};

/** GET público: datos mínimos para pantalla de firma */
export const getFirmaAcuerdoPublicInfo = async (req, res) => {
  try {
    const { token } = req.params;
    const doc = await findAcuerdoByToken(token);
    if (!doc) return res.status(404).json({ message: "Enlace inválido o acuerdo ya no está pendiente de firmas." });

    const rol = rolFromToken(doc, token);
    const slot = doc.firmas?.[rol];
    const po = await PostulacionOportunidad.findById(doc.postulacionOportunidad)
      .populate({
        path: "opportunity",
        select: "nombreCargo",
        populate: [{ path: "company", select: "name legalName" }],
      })
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name" } })
      .lean();

    const estudianteNombre = po?.postulant?.postulantId?.name || "—";
    const emp = po?.opportunity?.company;
    const empresa = emp?.legalName || emp?.name || "—";
    const cargo = po?.opportunity?.nombreCargo || "—";

    res.json({
      rol,
      rolEtiqueta:
        rol === "practicante" ? "Practicante" : rol === "escenario" ? "Escenario de práctica (entidad)" : "Universidad del Rosario",
      estadoAcuerdo: doc.estado,
      estadoMiFirma: slot?.estado || "pendiente",
      estudianteNombre,
      empresa,
      cargo,
      yaRespondio: slot && slot.estado !== "pendiente",
      respuesta: slot?.estado === "aprobado" ? "aprobado" : slot?.estado === "rechazado" ? "rechazado" : null,
      motivoRechazo: slot?.motivoRechazo || null,
    });
  } catch (err) {
    console.error("[AcuerdoVinculacionPractica] getFirmaPublicInfo:", err);
    res.status(500).json({ message: err.message });
  }
};

/** POST público */
export const postFirmaAcuerdoAprobar = async (req, res) => {
  try {
    const { token } = req.params;
    const doc = await AcuerdoVinculacionPractica.findOne({
      estado: "pendiente_firmas",
      $or: [
        { tokenPracticante: decodeURIComponent(String(token).trim()) },
        { tokenEscenario: decodeURIComponent(String(token).trim()) },
        { tokenUniversidad: decodeURIComponent(String(token).trim()) },
      ],
    });
    if (!doc) return res.status(404).json({ message: "Enlace inválido o acuerdo no pendiente." });

    const rol = rolFromToken(doc, token);
    if (!rol) return res.status(400).json({ message: "Token no reconocido" });
    if (doc.firmas[rol].estado !== "pendiente") {
      return res.status(409).json({ message: "Esta parte ya registró su respuesta." });
    }

    const uid = tryUserIdFromAuth(req);
    const ip = getClientIp(req);
    doc.firmas[rol].estado = "aprobado";
    doc.firmas[rol].fecha = new Date();
    doc.firmas[rol].ip = ip;
    doc.firmas[rol].usuario = uid || null;
    doc.firmas[rol].motivoRechazo = null;
    doc.markModified("firmas");

    const allOk =
      doc.firmas.practicante.estado === "aprobado" &&
      doc.firmas.escenario.estado === "aprobado" &&
      doc.firmas.universidad.estado === "aprobado";
    if (allOk) {
      doc.estado = "aprobado";
      await syncLegalizacionTresFirmas(doc.postulacionOportunidad, true);
    }

    await doc.save();
    try {
      await regenerarPdfSnapshotAcuerdo(doc._id);
    } catch (e) {
      console.error("[AcuerdoVinculacionPractica] Regenerar PDF tras aprobación:", e);
    }
    res.json({ message: "Aprobación registrada.", estadoAcuerdo: doc.estado, firmas: doc.firmas });
  } catch (err) {
    console.error("[AcuerdoVinculacionPractica] postAprobar:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postFirmaAcuerdoRechazar = async (req, res) => {
  try {
    const { token } = req.params;
    const motivo = String(req.body?.motivo || "").trim() || null;
    const doc = await AcuerdoVinculacionPractica.findOne({
      estado: "pendiente_firmas",
      $or: [
        { tokenPracticante: decodeURIComponent(String(token).trim()) },
        { tokenEscenario: decodeURIComponent(String(token).trim()) },
        { tokenUniversidad: decodeURIComponent(String(token).trim()) },
      ],
    });
    if (!doc) return res.status(404).json({ message: "Enlace inválido o acuerdo no pendiente." });

    const rol = rolFromToken(doc, token);
    if (!rol) return res.status(400).json({ message: "Token no reconocido" });
    if (doc.firmas[rol].estado !== "pendiente") {
      return res.status(409).json({ message: "Esta parte ya registró su respuesta." });
    }

    const uid = tryUserIdFromAuth(req);
    const ip = getClientIp(req);
    doc.firmas[rol].estado = "rechazado";
    doc.firmas[rol].fecha = new Date();
    doc.firmas[rol].ip = ip;
    doc.firmas[rol].usuario = uid || null;
    doc.firmas[rol].motivoRechazo = motivo;
    doc.markModified("firmas");
    doc.estado = "rechazado";
    await syncLegalizacionTresFirmas(doc.postulacionOportunidad, false);
    await doc.save();
    try {
      await regenerarPdfSnapshotAcuerdo(doc._id);
    } catch (e) {
      console.error("[AcuerdoVinculacionPractica] Regenerar PDF tras rechazo:", e);
    }
    res.json({ message: "Rechazo registrado.", estadoAcuerdo: doc.estado, firmas: doc.firmas });
  } catch (err) {
    console.error("[AcuerdoVinculacionPractica] postRechazar:", err);
    res.status(500).json({ message: err.message });
  }
};
