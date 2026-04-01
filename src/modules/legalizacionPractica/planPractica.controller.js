/**
 * RQ04_HU006 — Plan de práctica (PostulacionOportunidad). Sin notificaciones por correo en esta capa.
 */
import mongoose from "mongoose";
import LegalizacionPractica from "./legalizacionPractica.model.js";
import PlanPractica from "./planPractica.model.js";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import User from "../users/user.model.js";
import { ProfileEnrolledProgram } from "../postulants/models/profile/index.js";
import { uploadToS3, deleteFromS3, getSignedDownloadUrl } from "../../config/s3.config.js";
import { mapModuloToRole } from "../../middlewares/auth.js";
import {
  getPostulacionAceptadaEstudiante,
  listDefinicionesPracticaParaPostulacion,
  assertAdminLegalizacionAccess,
  resolveTutorPractica,
} from "./legalizacionPractica.controller.js";

const S3_PREFIX = "planes-practica";

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

function getLegDoc(leg, definitionId) {
  const id = String(definitionId);
  const m = leg.documentos;
  if (!m || typeof m !== "object") return null;
  return m[id] ?? null;
}

function getClientIp(req) {
  const x = req.headers["x-forwarded-for"];
  if (typeof x === "string" && x.trim()) return x.split(",")[0].trim().slice(0, 64);
  return (req.ip || req.socket?.remoteAddress || "").slice(0, 64) || null;
}

async function assertLegalizacionAprobadaConDocumentos(po, postulacionId) {
  const leg = await LegalizacionPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
  if (!leg || leg.estado !== "aprobada") {
    return { error: 400, message: "El plan de práctica solo está disponible cuando la legalización está aprobada." };
  }
  const defs = await listDefinicionesPracticaParaPostulacion(po);
  const oblig = defs.filter((d) => d.documentMandatory);
  for (const d of oblig) {
    const doc = getLegDoc(leg, d._id);
    if (!doc?.key) {
      return { error: 400, message: `Falta documento obligatorio en legalización: ${d.documentName || "documento"}` };
    }
    if (doc.estadoDocumento !== "aprobado") {
      return { error: 400, message: `Documento pendiente de aprobación: ${d.documentName || "documento"}` };
    }
  }
  return { leg, ok: true };
}

async function buildDatosPrecargados(po, postulacionId) {
  const opp = po.opportunity;
  const profileId = po.postulantProfile?._id ?? po.postulantProfile;
  const tutor = resolveTutorPractica(opp, postulacionId);
  const [postulantUser, enrolledPrograms] = await Promise.all([
    Postulant.findById(po.postulant).populate("postulantId", "name email").lean(),
    profileId
      ? ProfileEnrolledProgram.find({ profileId })
          .populate("programId", "name code")
          .populate({ path: "programFacultyId", populate: { path: "facultyId", select: "name" } })
          .lean()
      : [],
  ]);
  const firstEnrolled = enrolledPrograms[0];
  const company = opp?.company;
  const monitorNombre = opp?.creadoPor?.name || "";
  return {
    facultad: firstEnrolled?.programFacultyId?.facultyId?.name ?? "",
    programa: firstEnrolled?.programId?.name ?? "",
    periodo: opp?.periodo?.codigo ?? "",
    nombreCargo: opp?.nombreCargo ?? "",
    empresaNombre: company?.legalName || company?.name || company?.commercialName || "",
    estudianteNombre: postulantUser?.postulantId?.name ?? "",
    estudianteEmail: postulantUser?.postulantId?.email ?? "",
    monitorNombre,
    tutorNombres: tutor.nombres,
  };
}

function sumPonderacion(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((acc, p) => acc + (Number(p.porcentaje) || 0), 0);
}

function puedeEditarEstadoPlan(estado) {
  return estado === "borrador" || estado === "rechazado" || estado === "en_ajuste";
}

export async function getPlanPracticaDatosCrear(req, res) {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const ok = await assertLegalizacionAprobadaConDocumentos(result.po, postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const existente = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (existente) {
      return res.json({ plan: existente, yaExiste: true, datosPrecargados: await buildDatosPrecargados(result.po, postulacionId) });
    }
    const datosPrecargados = await buildDatosPrecargados(result.po, postulacionId);
    return res.json({ datosPrecargados, yaExiste: false });
  } catch (err) {
    console.error("[PlanPractica] getPlanPracticaDatosCrear:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getPlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const isStudent = userRoleEffective(req) === "student";

    if (isStudent) {
      const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      const ok = await assertLegalizacionAprobadaConDocumentos(result.po, postulacionId);
      if (ok.error) return res.status(ok.error).json({ message: ok.message });
      const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
      if (!plan) return res.status(404).json({ message: "Plan de práctica no encontrado." });
      const datosPrecargados = await buildDatosPrecargados(result.po, postulacionId);
      return res.json({ plan, datosPrecargados, oportunidad: result.po.opportunity });
    }

    const admin = await assertAdminLegalizacionAccess(req, postulacionId);
    if (admin.error) return res.status(admin.error).json({ message: admin.message });
    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    if (!plan) return res.status(404).json({ message: "Plan de práctica no encontrado." });
    const datosPrecargados = await buildDatosPrecargados(admin.po, postulacionId);
    const po = await PostulacionOportunidad.findById(postulacionId)
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();
    const estudiante = po?.postulant?.postulantId;
    return res.json({ plan, datosPrecargados, oportunidad: admin.po.opportunity, estudiante });
  } catch (err) {
    console.error("[PlanPractica] getPlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function createPlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const ok = await assertLegalizacionAprobadaConDocumentos(result.po, postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const existente = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (existente) return res.status(400).json({ message: "Ya existe un plan de práctica para esta postulación." });

    const datos = await buildDatosPrecargados(result.po, postulacionId);
    const plan = await PlanPractica.create({
      postulacionOportunidad: postulacionId,
      estado: "borrador",
      ...datos,
      emailsFirma: { estudiante: "", monitor: "", tutor: "" },
    });
    res.status(201).json({ plan, message: "Plan de práctica creado" });
  } catch (err) {
    console.error("[PlanPractica] createPlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function updatePlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const ok = await assertLegalizacionAprobadaConDocumentos(result.po, postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de práctica no encontrado" });
    if (!puedeEditarEstadoPlan(plan.estado)) {
      return res.status(400).json({ message: "No puede editar el plan en el estado actual." });
    }

    const body = req.body || {};
    const {
      modoPlan,
      objetivoFormativoItemId,
      objetivoFormativoTexto,
      justificacion,
      objetivoGeneral,
      objetivosEspecificos,
      actividades,
      seguimientosPlan,
      ponderacion,
    } = body;

    if (modoPlan === "formato_ur" || modoPlan === "documento_externo") plan.modoPlan = modoPlan;
    if (objetivoFormativoTexto !== undefined) plan.objetivoFormativoTexto = objetivoFormativoTexto;
    if (justificacion !== undefined) plan.justificacion = justificacion;
    if (objetivoGeneral !== undefined) plan.objetivoGeneral = objetivoGeneral;
    if (objetivosEspecificos !== undefined) plan.objetivosEspecificos = objetivosEspecificos;
    if (Array.isArray(actividades)) plan.actividades = actividades;
    if (Array.isArray(seguimientosPlan)) plan.seguimientosPlan = seguimientosPlan;
    if (Array.isArray(ponderacion)) plan.ponderacion = ponderacion;

    if (objetivoFormativoItemId !== undefined) {
      if (objetivoFormativoItemId === null || objetivoFormativoItemId === "") {
        plan.objetivoFormativoItemId = null;
      } else if (mongoose.Types.ObjectId.isValid(String(objetivoFormativoItemId))) {
        plan.objetivoFormativoItemId = objetivoFormativoItemId;
      }
    }

    if (plan.estado === "rechazado" || plan.estado === "en_ajuste") {
      plan.estado = "borrador";
      plan.rechazoMotivo = null;
    }

    await plan.save();
    res.json({ plan, message: "Plan actualizado" });
  } catch (err) {
    console.error("[PlanPractica] updatePlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postEnviarFirmasPlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const ok = await assertLegalizacionAprobadaConDocumentos(result.po, postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de práctica no encontrado" });
    if (plan.estado !== "borrador") {
      return res.status(400).json({ message: "Solo puede enviar a firmas un plan en borrador." });
    }

    const opp = result.po.opportunity;
    const tutor = resolveTutorPractica(opp, postulacionId);
    const estEmail = normalizeEmail(plan.estudianteEmail);
    const monEmail = normalizeEmail(opp?.creadoPor?.email);
    const tutEmail = tutor.email && tutor.email !== "—" ? normalizeEmail(tutor.email) : "";

    if (plan.modoPlan === "documento_externo") {
      if (!plan.documentoExterno?.key) {
        return res.status(400).json({ message: "Debe cargar el documento PDF del plan antes de enviar a firmas." });
      }
    } else {
      if (!String(plan.justificacion || "").trim() || !String(plan.objetivoGeneral || "").trim() || !String(plan.objetivosEspecificos || "").trim()) {
        return res.status(400).json({ message: "Complete justificación, objetivo general y objetivos específicos." });
      }
      const acts = plan.actividades || [];
      if (acts.length === 0) {
        return res.status(400).json({ message: "Agregue al menos una actividad al plan." });
      }
    }

    const totalP = sumPonderacion(plan.ponderacion);
    if (totalP > 100) {
      return res.status(400).json({ message: "La ponderación no puede superar el 100%." });
    }
    plan.advertenciaPonderacion = totalP < 100 && totalP > 0 ? `La ponderación suma ${totalP}% (se espera 100%).` : null;

    if (!isValidEmail(estEmail)) return res.status(400).json({ message: "El correo del estudiante no es válido para firmas." });
    if (!isValidEmail(monEmail)) return res.status(400).json({ message: "No hay correo de monitor/líder de práctica en la oferta; actualice la oportunidad o contacte a coordinación." });
    if (!isValidEmail(tutEmail)) return res.status(400).json({ message: "No hay correo válido del tutor en escenario; complete los datos del tutor en la oferta." });

    plan.emailsFirma = {
      estudiante: estEmail,
      monitor: monEmail,
      tutor: tutEmail,
    };
    plan.firmas = {
      estudiante: { estado: "pendiente", fecha: null, usuario: null, ip: null },
      monitor: { estado: "pendiente", fecha: null, usuario: null, ip: null },
      tutor: { estado: "pendiente", fecha: null, usuario: null, ip: null },
    };
    plan.estado = "pendiente_firmas";
    plan.enviadoFirmasAt = new Date();
    await plan.save();

    res.json({ plan, message: "Plan enviado a firmas. Los firmantes deben registrar su aprobación en el sistema." });
  } catch (err) {
    console.error("[PlanPractica] postEnviarFirmasPlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postFirmarPlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const { rol } = req.body || {};
    if (!["estudiante", "monitor", "tutor"].includes(rol)) {
      return res.status(400).json({ message: "Indique rol: estudiante, monitor o tutor." });
    }

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de práctica no encontrado" });
    if (plan.estado !== "pendiente_firmas") {
      return res.status(400).json({ message: "El plan no está en espera de firmas." });
    }

    const user = await User.findById(req.user?.id).select("email").lean();
    const email = normalizeEmail(user?.email);
    if (!email) return res.status(403).json({ message: "Usuario sin correo en el sistema." });

    const slot = plan.firmas[rol];
    if (!slot || slot.estado === "aprobado") {
      return res.status(400).json({ message: "Esta firma ya fue registrada." });
    }

    const expected = plan.emailsFirma[rol];
    let allowed = false;

    if (rol === "estudiante") {
      const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (result.error) return res.status(403).json({ message: "Solo el estudiante puede firmar este apartado." });
      allowed = emailsMatch(email, expected);
    } else if (userIsAdminLike(req)) {
      allowed = true;
    } else {
      allowed = emailsMatch(email, expected);
    }

    if (!allowed) return res.status(403).json({ message: "No autorizado para registrar esta firma." });

    slot.estado = "aprobado";
    slot.fecha = new Date();
    slot.usuario = req.user?.id || null;
    slot.ip = getClientIp(req);
    plan.markModified("firmas");

    const allOk =
      plan.firmas.estudiante.estado === "aprobado" &&
      plan.firmas.monitor.estado === "aprobado" &&
      plan.firmas.tutor.estado === "aprobado";

    if (allOk) {
      plan.estado = "pendiente_revision";
      plan.firmasCompletasAt = new Date();
      plan.enviadoRevisionAt = new Date();
    }

    await plan.save();
    res.json({ plan, message: allOk ? "Firmas completas. El plan quedó en revisión de coordinación." : "Firma registrada." });
  } catch (err) {
    console.error("[PlanPractica] postFirmarPlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postAprobarPlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const admin = await assertAdminLegalizacionAccess(req, postulacionId);
    if (admin.error) return res.status(admin.error).json({ message: admin.message });

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de práctica no encontrado" });
    if (plan.estado !== "pendiente_revision") {
      return res.status(400).json({ message: "Solo se puede aprobar un plan en revisión de coordinación." });
    }

    plan.estado = "aprobado";
    plan.aprobadoAt = new Date();
    plan.aprobadoPor = req.user?.id ?? null;
    await plan.save();
    res.json({ plan, message: "Plan aprobado" });
  } catch (err) {
    console.error("[PlanPractica] postAprobarPlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function postRechazarPlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const { motivo, enviarAjuste } = req.body || {};
    const admin = await assertAdminLegalizacionAccess(req, postulacionId);
    if (admin.error) return res.status(admin.error).json({ message: admin.message });

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!plan) return res.status(404).json({ message: "Plan de práctica no encontrado" });
    if (plan.estado !== "pendiente_revision") {
      return res.status(400).json({ message: "Solo se puede rechazar un plan en revisión de coordinación." });
    }

    const motivoStr = (motivo || "").trim() || null;
    if (enviarAjuste) {
      plan.estado = "en_ajuste";
    } else {
      plan.estado = "rechazado";
      plan.rechazadoAt = new Date();
    }
    plan.rechazoMotivo = motivoStr;
    plan.rechazadoPor = req.user?.id ?? null;
    await plan.save();
    res.json({
      plan,
      message: enviarAjuste ? "Plan devuelto a ajuste para el estudiante." : "Plan rechazado. El estudiante podrá corregir y volver a enviar a firmas.",
    });
  } catch (err) {
    console.error("[PlanPractica] postRechazarPlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

const MIME_EXT = {
  "application/pdf": "pdf",
};

export async function uploadDocumentoExternoPlanPractica(req, res) {
  try {
    const { postulacionId } = req.params;
    const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
    if (result.error) return res.status(result.error).json({ message: result.message });
    const ok = await assertLegalizacionAprobadaConDocumentos(result.po, postulacionId);
    if (ok.error) return res.status(ok.error).json({ message: ok.message });

    if (!req.file?.buffer) return res.status(400).json({ message: "Archivo requerido (PDF)." });
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ message: "Solo se admite PDF (formato UR o documento externo)." });
    }

    const plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId });
    if (!plan) return res.status(404).json({ message: "Cree primero el plan de práctica." });
    if (!puedeEditarEstadoPlan(plan.estado)) {
      return res.status(400).json({ message: "No puede cargar documentos en el estado actual." });
    }
    if (plan.modoPlan !== "documento_externo") {
      return res.status(400).json({ message: "Solo use este cargue cuando el modo del plan sea documento externo." });
    }

    const ext = MIME_EXT[req.file.mimetype] || "pdf";
    const key = `${S3_PREFIX}/${postulacionId}/externo.${ext}`;
    if (plan.documentoExterno?.key && plan.documentoExterno.key !== key) {
      try {
        await deleteFromS3(plan.documentoExterno.key);
      } catch (_) {
        /* ignore */
      }
    }
    await uploadToS3(key, req.file.buffer, { contentType: req.file.mimetype || "application/pdf" });
    plan.documentoExterno = {
      key,
      originalName: req.file.originalname || `plan.${ext}`,
      contentType: req.file.mimetype,
      uploadedAt: new Date(),
    };
    await plan.save();
    res.json({ plan, message: "Documento cargado" });
  } catch (err) {
    console.error("[PlanPractica] uploadDocumentoExternoPlanPractica:", err);
    res.status(500).json({ message: err.message });
  }
}

export async function getDocumentoExternoPlanPracticaUrl(req, res) {
  try {
    const { postulacionId } = req.params;
    const isStudent = userRoleEffective(req) === "student";

    let plan;
    if (isStudent) {
      const result = await getPostulacionAceptadaEstudiante(req, postulacionId);
      if (result.error) return res.status(result.error).json({ message: result.message });
      plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    } else {
      const admin = await assertAdminLegalizacionAccess(req, postulacionId);
      if (admin.error) return res.status(admin.error).json({ message: admin.message });
      plan = await PlanPractica.findOne({ postulacionOportunidad: postulacionId }).lean();
    }

    if (!plan?.documentoExterno?.key) return res.status(404).json({ message: "No hay documento externo." });
    const name = plan.documentoExterno.originalName || "plan.pdf";
    const url = await getSignedDownloadUrl(plan.documentoExterno.key, 3600, {
      responseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      responseContentType: plan.documentoExterno.contentType || "application/pdf",
    });
    res.json({ url });
  } catch (err) {
    console.error("[PlanPractica] getDocumentoExternoPlanPracticaUrl:", err);
    res.status(500).json({ message: err.message });
  }
}
