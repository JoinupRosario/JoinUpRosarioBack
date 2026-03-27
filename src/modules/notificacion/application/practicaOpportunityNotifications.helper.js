/**
 * Notificaciones tipo "practica" ligadas a oportunidades y postulaciones (PostulacionOportunidad).
 *
 * Inventario dispatch backend (referencia rápida):
 * - companies: registro_entidad, envio_usuario_contrasena_entidad (create/publicRegister);
 *   creacion_tutores (addContact si isPracticeTutor)
 * - opportunities: creacion_oportunidad; changeStatus → activacion_rechazo_oportunidad | actualizacion_estado_oportunidad;
 *   rejectOpportunity → activacion_rechazo_oportunidad; approveProgram/rejectProgram → actualizacion_estado_oportunidad;
 *   aplicarOportunidad + applyToOpportunity (legacy) → postulacion_estudiantes_entidad_lideres;
 *   estudianteResponderPostulacion + coordinacionAceptarEnNombreEstudiante → aceptacion_*, actualizacion_*_entidad,
 *   notificacion_entidad_estudiante_no_continua; updateApplicationState (rechazado) → no_aceptacion_*;
 *   markApplicationDescargoHv → envio_hojas_vida_estudiante_entidad; closeOpportunity → notificacion_resultados_*
 * - oportunidadMTM.controller: dispatchMonitoriaNotificacion en eventos monitoría del flujo
 *   de postulaciones, legalización, plan, seguimiento y asistencia
 * - opportunities reviewApplication / selectMultipleApplications (postulaciones embebidas legacy, tipo practica)
 *
 * Eventos con plantilla HU pero sin hook automático en código (requieren job/cron u otro módulo):
 * forma_vinculacion_*, carta_presentacion_*, notificacion_ingreso_documento_vinculacion, notificacion_afiliacion_arl,
 * notificacion_tutor, notificacion_monitor (práctica), aprobacion_plan_practica, plan_practica_aprobado_firmado,
 * aprobacion_productos_seguimiento_estudiante, aprobacion_informe_final_practica_pasantia, solicitud_certificacion_practica,
 * inscripcion_oportunidades, aprobacion_inscripcion_oportunidad_estudiante_entidad, notificacion_oportunidad_proxima_*,
 * notificacion_oportunidades_pendientes_aprobacion_lider, falta_cumplimiento_requisitos_curriculares_inscripcion,
 * reporte_nota, notificacion_no_creacion_oportunidad, envio_hojas_vida (otros flujos), etc.
 */
import PostulacionOportunidad from "../../opportunities/postulacionOportunidad.model.js";
import { ProfileEnrolledProgram } from "../../postulants/models/profile/index.js";
import { dispatchNotificationByEvent } from "./dispatchNotificationByEvent.service.js";
import { parseEnvEmailList } from "./resolveRecipientEmails.js";

export function practicaFrontendLink() {
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
  return `${String(baseUrl).replace(/\/$/, "")}/#/`;
}

function withQuery(path, query = {}) {
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v != null && String(v).trim() !== "")
  ).toString();
  return qs ? `${path}?${qs}` : path;
}

export function practicaOpportunityDashboardLink(opportunityId) {
  const base = practicaFrontendLink();
  return `${base}${withQuery("/dashboard/oportunidades", { opportunityId })}`;
}

export function practicaMisAplicacionesLink(opportunityId, postulacionId) {
  const base = practicaFrontendLink();
  return `${base}${withQuery("/dashboard/mis-aplicaciones", { opportunityId, postulacionId })}`;
}

/** Entidad + coordinación (sin estudiante): evita que el fallback envíe el mismo cuerpo al estudiante. */
export function entityAndCoordinatorsRecipientContext(creadorEmail) {
  return {
    lider_practica: creadorEmail,
    coordinador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR),
    administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
  };
}

/** Solo estudiante/postulante. */
export function studentOnlyRecipientContext(email) {
  const e = String(email || "").trim();
  return e ? { estudiante: e, postulante: e } : {};
}

function buildProgramasLineFromOpportunity(opp) {
  const programasAprobaciones = Array.isArray(opp?.aprobacionesPorPrograma)
    ? opp.aprobacionesPorPrograma
        .map((ap) => {
          const level = String(ap?.programa?.level || "").trim();
          const program = String(ap?.programa?.program || "").trim();
          if (level && program) return `${level} - ${program}`;
          return program || level || "";
        })
        .filter(Boolean)
    : [];
  const programasFormacion = Array.isArray(opp?.formacionAcademica)
    ? opp.formacionAcademica
        .map((f) => {
          const level = String(f?.level || "").trim();
          const program = String(f?.program || "").trim();
          if (level && program) return `${level} - ${program}`;
          return program || level || "";
        })
        .filter(Boolean)
    : [];
  const merged = [...new Set([...programasAprobaciones, ...programasFormacion])];
  return merged.length ? merged.join(", ") : "";
}

function direccionEntidadFromCompany(company) {
  const c = company || {};
  return String(
    c.address ||
      c.direccion ||
      c.contact?.address ||
      (Array.isArray(c.branches) ? c.branches[0]?.address : "") ||
      ""
  ).trim();
}

export function buildDatosPracticaSimple(opp, postulantUser, extra = {}) {
  const company = opp?.company;
  const { nombre, apellido } = splitName(postulantUser?.name);
  const opportunityId = opp?._id != null ? String(opp._id) : "";
  const programasOpp = buildProgramasLineFromOpportunity(opp);
  return {
    NOMBRE_OPORTUNIDAD: opp?.nombreCargo || "",
    NOMBRE_ENTIDAD: company?.commercialName || company?.name || "",
    NOMBRE_ESTUDIANTE: nombre,
    APELLIDO_ESTUDIANTE: apellido,
    PROGRAMA: programasOpp || "—",
    DIRECCION: direccionEntidadFromCompany(company),
    TELEFONO: String(company?.phone || company?.contact?.phone || "").trim(),
    LINK: practicaMisAplicacionesLink(opportunityId),
    OBSERVACION: "",
    COMENTARIO: "",
    ESTADO_OPORTUNIDAD: "",
    ...extra,
  };
}

export async function dispatchPracticaNotification(eventValue, datos, recipientContext, metadata = {}) {
  try {
    await dispatchNotificationByEvent({
      eventValue,
      tipo: "practica",
      datos,
      recipientContext,
      metadata,
    });
  } catch (e) {
    console.error(`[notificacion practica] ${eventValue}:`, e?.message || e);
  }
}

function splitName(full) {
  const t = String(full || "").trim();
  if (!t) return { nombre: "", apellido: "" };
  const parts = t.split(/\s+/);
  return { nombre: parts[0] || "", apellido: parts.slice(1).join(" ") || "" };
}

/**
 * Carga oportunidad, empresa y postulante para armar variables de plantilla HU práctica.
 * @returns {Promise<null | { po: object, datos: Record<string,string>, postulantEmail: string, creadorEmail: string }>}
 */
export async function loadPracticaPostulacionContext(postulacionId) {
  if (!postulacionId) return null;
  const po = await PostulacionOportunidad.findById(postulacionId)
    .populate({
      path: "opportunity",
      populate: [
        { path: "company", select: "name commercialName address phone contact branches" },
        { path: "creadoPor", select: "email name" },
      ],
    })
    .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
    .populate("postulantProfile", "studentCode")
    .lean();
  if (!po?.opportunity) return null;
  const opp = po.opportunity;
  if (String(opp.tipo || "").toLowerCase() !== "practica") return null;

  const company = opp.company;
  const user = po.postulant?.postulantId;
  const { nombre, apellido } = splitName(user?.name);
  const programasOpp = buildProgramasLineFromOpportunity(opp);
  let programa = programasOpp;
  if (!programa && po.postulantProfile?._id) {
    try {
      const en = await ProfileEnrolledProgram.findOne({ profileId: po.postulantProfile._id })
        .populate("programId", "name")
        .lean();
      if (en?.programId?.name) programa = String(en.programId.name);
    } catch (_) {}
  }
  if (!programa) programa = "—";
  const link = practicaMisAplicacionesLink(String(opp?._id || ""), String(po?._id || ""));
  const datos = {
    NOMBRE_OPORTUNIDAD: opp.nombreCargo || "",
    NOMBRE_ENTIDAD: company?.commercialName || company?.name || "",
    NOMBRE_ESTUDIANTE: nombre,
    APELLIDO_ESTUDIANTE: apellido,
    PROGRAMA: programa,
    DIRECCION: direccionEntidadFromCompany(company),
    TELEFONO: String(company?.phone || company?.contact?.phone || "").trim(),
    LINK: link,
    OBSERVACION: "",
    COMENTARIO: "",
    ESTADO_OPORTUNIDAD: "",
  };
  return {
    po,
    datos,
    postulantEmail: user?.email || "",
    creadorEmail: opp.creadoPor?.email || "",
  };
}

/**
 * IDs de otras postulaciones del mismo postulante que serán marcadas como rechazadas (p. ej. al aceptar una).
 */
export async function findOtrasPostulacionesActivas(postulantId, excludePostulacionId) {
  if (!postulantId) return [];
  return PostulacionOportunidad.find({
    postulant: postulantId,
    _id: { $ne: excludePostulacionId },
    estado: { $in: ["aplicado", "empresa_consulto_perfil", "empresa_descargo_hv", "seleccionado_empresa"] },
  })
    .select("_id")
    .lean();
}
