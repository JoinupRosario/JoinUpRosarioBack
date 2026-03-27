/**
 * Re-dispara notificaciones por evento usando datos reales ya guardados en Mongo
 * (no ejecuta rutas HTTP). Útil para probar plantillas/cola tras seed o migración.
 *
 * Por defecto solo muestra qué enviaría (dry-run). Para ejecutar:
 *   node src/scripts/bulkDispatchNotificationsFromDb.js --send
 *
 * Opciones:
 *   --send              Ejecuta dispatchNotificationByEvent (sin esto, solo simula).
 *   --limit=N           Máximo de documentos por consulta / sub-bloque (default 5).
 *   --only=general|practica|monitoria|all   Filtra grupos (default all).
 *   --all-records       Desactiva dedupe por eventValue y envía por cada registro.
 *
 * Requiere: MONGO_URI, plantillas activas por evento, SENDGRID si modo inmediato, etc.
 *
 * No cubre: notificacion_entidad_estudiante_no_continua (requiere contexto multi-postulación),
 * flujos legacy embebidos en Opportunity.postulaciones, ni eventos sin hook en código.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Company from "../modules/companies/company.model.js";
import { buildDatosPlantillaEntidad } from "../modules/companies/companyNotificationTemplate.helper.js";
import Opportunity from "../modules/opportunities/opportunity.model.js";
import PostulacionOportunidad from "../modules/opportunities/postulacionOportunidad.model.js";
import OportunidadMTM from "../modules/oportunidadesMTM/oportunidadMTM.model.js";
import PostulacionMTM from "../modules/oportunidadesMTM/postulacionMTM.model.js";
import LegalizacionMTM from "../modules/oportunidadesMTM/legalizacionMTM.model.js";
import PlanDeTrabajoMTM from "../modules/oportunidadesMTM/planDeTrabajoMTM.model.js";
import SeguimientoMTM from "../modules/oportunidadesMTM/seguimientoMTM.model.js";
import { dispatchNotificationByEvent } from "../modules/notificacion/application/dispatchNotificationByEvent.service.js";
import { parseEnvEmailList } from "../modules/notificacion/application/resolveRecipientEmails.js";
import {
  loadPracticaPostulacionContext,
  entityAndCoordinatorsRecipientContext,
  studentOnlyRecipientContext,
  buildDatosPracticaSimple,
  practicaOpportunityDashboardLink,
} from "../modules/notificacion/application/practicaOpportunityNotifications.helper.js";
import {
  loadMtmPostulacionContext,
  loadMtmPostulacionContextFromLegalizacion,
  recipientContextCoordProf,
  buildVariablesPlantillaMtmPlanCargo,
  mtmFrontendLink,
} from "../modules/notificacion/application/mtmNotifications.helper.js";

import "../modules/shared/reference-data/models/item.schema.js";
import "../modules/postulants/models/postulants.schema.js";
/** Requerido para populate postulantProfile en loadPracticaPostulacionContext */
import "../modules/postulants/models/profile/profile.schema.js";
/** Requerido si ProfileEnrolledProgram.populate('programId') se usa en el helper */
import "../modules/program/model/program.model.js";
import "../modules/users/user.model.js";
import "../modules/usersAdministrativos/userAdministrativo.model.js";
import "../modules/periodos/periodo.model.js";

dotenv.config();

let DISPATCH_ONLY_ONCE_PER_EVENT = true;
const DISPATCHED_EVENT_KEYS = new Set();

function argVal(name, def) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  return def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const POP_OPP_CREACION = [
  { path: "company", select: "name commercialName sector logo address phone contact branches" },
  { path: "creadoPor", select: "name email" },
  { path: "tipoVinculacion", select: "value description listId" },
  { path: "periodo", select: "codigo tipo estado" },
  { path: "revisadoPor", select: "email name" },
  { path: "activadoPor", select: "email name" },
  { path: "rechazadoPor", select: "email name" },
];

async function safeDispatch(label, params, dryRun, stats) {
  const eventKey = `${params?.tipo || "monitoria"}::${params?.eventValue || ""}`;
  if (DISPATCH_ONLY_ONCE_PER_EVENT && params?.eventValue) {
    if (DISPATCHED_EVENT_KEYS.has(eventKey)) {
      stats.skippedDuplicateEvent = (stats.skippedDuplicateEvent || 0) + 1;
      console.log(`  [skip] omitido duplicado de evento en esta corrida: ${eventKey}`);
      return;
    }
    DISPATCHED_EVENT_KEYS.add(eventKey);
  }
  stats.attempted += 1;
  if (dryRun) {
    console.log(`  [dry-run] ${label} -> ${params.eventValue} (${params.tipo})`);
    return;
  }
  try {
    const r = await dispatchNotificationByEvent(params);
    if (r == null) {
      stats.skippedNull += 1;
      console.log(`  [warn] ${label}: sin evento/plantilla activa o sin render`);
    } else {
      stats.dispatched += 1;
      const q = r.queued ?? 0;
      const i = r.immediateSent ?? 0;
      console.log(`  [ok] ${label}: queued=${q} immediate=${i} recipients=${(r.recipients || []).length}`);
    }
  } catch (e) {
    stats.errors += 1;
    console.error(`  [err] ${label}:`, e?.message || e);
  }
}

async function runGeneral(limit, dryRun, stats) {
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
  const linkLogin = `${String(baseUrl).replace(/\/$/, "")}/#/login`;
  const linkRoot = `${String(baseUrl).replace(/\/$/, "")}/#/`;

  const companies = await Company.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  for (const company of companies) {
    const usuario = company.contact?.email || company.email || "";
    if (!usuario) continue;
    const ctx = {
      lider_practica: usuario,
      coordinador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR),
      administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
      usuario,
      entidad: usuario,
    };
    const datosCompletos = buildDatosPlantillaEntidad(company, { userEmail: usuario, link: linkLogin, password: "" });

    await safeDispatch(
      `general/registro_entidad company=${company._id}`,
      {
        eventValue: "registro_entidad",
        tipo: "general",
        datos: { ...datosCompletos, CONTRASENA_TEMPORAL: "" },
        recipientContext: ctx,
        metadata: { companyId: String(company._id), source: "bulkDispatchFromDb" },
      },
      dryRun,
      stats
    );
    await safeDispatch(
      `general/envio_usuario_contrasena company=${company._id}`,
      {
        eventValue: "envio_usuario_contrasena_entidad",
        tipo: "general",
        datos: datosCompletos,
        recipientContext: ctx,
        metadata: { companyId: String(company._id), source: "bulkDispatchFromDb" },
      },
      dryRun,
      stats
    );
  }

  const companiesWithContacts = await Company.find({ "contacts.0": { $exists: true } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  for (const company of companiesWithContacts) {
    const tutors = (company.contacts || []).filter((c) => c.isPracticeTutor === true || c.isPracticeTutor === "true");
    for (const c of tutors.slice(0, limit)) {
      const nombre = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Tutor";
      await safeDispatch(
        `general/creacion_tutores company=${company._id} contact=${c._id}`,
        {
          eventValue: "creacion_tutores",
          tipo: "general",
          datos: {
            NOMBRE_TUTOR: nombre,
            PROGRAMA: c.position || "—",
            LINK: linkRoot,
            COMENTARIO: `Tutor de práctica — entidad ${company.commercialName || company.name || ""} (replay)`,
          },
          recipientContext: {
            coordinador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR),
            administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
          },
          metadata: { companyId: String(company._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
  }
}

async function runPractica(limit, dryRun, stats) {
  const oppsPractica = await Opportunity.find({ tipo: /practica/i })
    .populate(POP_OPP_CREACION)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  for (const opportunity of oppsPractica) {
    const tv = opportunity.tipoVinculacion;
    const modalidad = tv && typeof tv === "object" ? String(tv.description || tv.value || "").trim() : "";
    const programas = Array.isArray(opportunity.aprobacionesPorPrograma)
      ? opportunity.aprobacionesPorPrograma
          .map((ap) => {
            const level = String(ap?.programa?.level || "").trim();
            const program = String(ap?.programa?.program || "").trim();
            if (level && program) return `${level} - ${program}`;
            return program || level || "";
          })
          .filter(Boolean)
      : [];
    const datosCreacion = {
      NOMBRE_OPORTUNIDAD: opportunity.nombreCargo || "",
      TIPO_OPORTUNIDAD: "Práctica profesional",
      MODALIDAD_VINCULACION: modalidad,
      FUNCIONES: String(opportunity.funciones || "").trim(),
      PROGRAMA: programas.join(", "),
      PERIODO: opportunity.periodo?.codigo != null ? String(opportunity.periodo.codigo) : "",
      LINK: practicaOpportunityDashboardLink(opportunity._id),
      NOMBRE_ENTIDAD: opportunity.company?.commercialName || opportunity.company?.name || "",
    };
    const creadorEmail = opportunity.creadoPor?.email;
    await safeDispatch(
      `practica/creacion_oportunidad opp=${opportunity._id}`,
      {
        eventValue: "creacion_oportunidad",
        tipo: "practica",
        datos: datosCreacion,
        recipientContext: {
          lider_practica: creadorEmail,
          coordinador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR),
          administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
        },
        metadata: { opportunityId: String(opportunity._id), source: "bulkDispatchFromDb" },
      },
      dryRun,
      stats
    );

    const estado = opportunity.estado || "";
    const isActivaORechazada = estado === "Activa" || estado === "Rechazada";
    const eventValue = isActivaORechazada ? "activacion_rechazo_oportunidad" : "actualizacion_estado_oportunidad";
    await safeDispatch(
      `practica/${eventValue} opp=${opportunity._id}`,
      {
        eventValue,
        tipo: "practica",
        datos: {
          NOMBRE_OPORTUNIDAD: opportunity.nombreCargo || "",
          ESTADO_OPORTUNIDAD: estado,
          OBSERVACION: "Replay desde datos actuales en BD.",
          LINK: practicaOpportunityDashboardLink(opportunity._id),
        },
        recipientContext: {
          ...entityAndCoordinatorsRecipientContext(creadorEmail),
          lider_practica: [
            creadorEmail,
            opportunity?.revisadoPor?.email,
            opportunity?.activadoPor?.email,
            opportunity?.rechazadoPor?.email,
          ].filter(Boolean),
        },
        metadata: { opportunityId: String(opportunity._id), source: "bulkDispatchFromDb" },
      },
      dryRun,
      stats
    );
  }

  const postulaciones = await PostulacionOportunidad.find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("_id estado")
    .lean();

  for (const row of postulaciones) {
    const ctx = await loadPracticaPostulacionContext(row._id);
    if (!ctx) continue;

    await safeDispatch(
      `practica/postulacion_estudiantes po=${row._id}`,
      {
        eventValue: "postulacion_estudiantes_entidad_lideres",
        tipo: "practica",
        datos: ctx.datos,
        recipientContext: entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
        metadata: { postulacionId: String(row._id), source: "bulkDispatchFromDb" },
      },
      dryRun,
      stats
    );

    if (row.estado === "aceptado_estudiante") {
      await safeDispatch(
        `practica/aceptacion_inscripcion po=${row._id}`,
        {
          eventValue: "aceptacion_inscripcion_oportunidad_estudiantes",
          tipo: "practica",
          datos: ctx.datos,
          recipientContext: studentOnlyRecipientContext(ctx.postulantEmail),
          metadata: { postulacionId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }

    if (row.estado === "seleccionado_empresa") {
      await safeDispatch(
        `practica/actualizacion_aceptacion_entidad po=${row._id}`,
        {
          eventValue: "actualizacion_estado_oportunidad_aceptacion_rechazo_entidad",
          tipo: "practica",
          datos: {
            ...ctx.datos,
            ESTADO_OPORTUNIDAD: "Seleccionado por entidad",
            COMENTARIO: "Replay desde BD.",
          },
          recipientContext: entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
          metadata: { postulacionId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }

    if (row.estado === "rechazado") {
      await safeDispatch(
        `practica/no_aceptacion po=${row._id}`,
        {
          eventValue: "no_aceptacion_inscripcion_oportunidad_estudiantes",
          tipo: "practica",
          datos: { ...ctx.datos, COMENTARIO: "Replay desde BD.", OBSERVACION: "Replay desde BD." },
          recipientContext: studentOnlyRecipientContext(ctx.postulantEmail),
          metadata: { postulacionId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
      await safeDispatch(
        `practica/notificacion_resultados po=${row._id}`,
        {
          eventValue: "notificacion_resultados_postulacion_estudiantes",
          tipo: "practica",
          datos: { ...ctx.datos, OBSERVACION: "Resultado de postulación (replay)." },
          recipientContext: studentOnlyRecipientContext(ctx.postulantEmail),
          metadata: { postulacionId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }

    if (row.estado === "empresa_descargo_hv") {
      await safeDispatch(
        `practica/envio_hojas_vida po=${row._id}`,
        {
          eventValue: "envio_hojas_vida_estudiante_entidad",
          tipo: "practica",
          datos: { ...ctx.datos, OBSERVACION: "Registro HV / descarga (replay)." },
          recipientContext: entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
          metadata: { postulacionId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
  }
}

async function runMonitoria(limit, dryRun, stats) {
  const posMtm = await PostulacionMTM.find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("_id estado")
    .lean();

  for (const row of posMtm) {
    const ctx = await loadMtmPostulacionContext(row._id);
    if (!ctx) continue;

    if (row.estado === "seleccionado_empresa") {
      await safeDispatch(
        `monitoria/aprobacion_postulante po=${row._id}`,
        {
          eventValue: "aprobacion_postulante_por_oportunidad",
          tipo: "monitoria",
          datos: ctx.datos,
          recipientContext: { estudiante: ctx.estudianteEmail, postulante: ctx.estudianteEmail },
          metadata: { postulacionMtmId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (row.estado === "rechazado") {
      await safeDispatch(
        `monitoria/rechazo_postulante po=${row._id}`,
        {
          eventValue: "rechazo_postulante_por_oportunidad",
          tipo: "monitoria",
          datos: ctx.datos,
          recipientContext: { estudiante: ctx.estudianteEmail, postulante: ctx.estudianteEmail },
          metadata: { postulacionMtmId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (row.estado === "aceptado_estudiante") {
      await safeDispatch(
        `monitoria/aceptacion_oferta po=${row._id}`,
        {
          eventValue: "aceptacion_oferta_por_estudiante",
          tipo: "monitoria",
          datos: ctx.datos,
          recipientContext: recipientContextCoordProf(ctx.profEmail),
          metadata: { postulacionMtmId: String(row._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
  }

  const legs = await LegalizacionMTM.find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  for (const leg of legs) {
    const ctx = await loadMtmPostulacionContextFromLegalizacion(leg._id);
    if (!ctx) continue;
    if (leg.estado === "en_revision") {
      await safeDispatch(
        `monitoria/envio_revision_legalizacion leg=${leg._id}`,
        {
          eventValue: "envio_revision_legalizacion_monitoria",
          tipo: "monitoria",
          datos: ctx.datos,
          recipientContext: {
            coordinador: [ctx.profEmail, ...parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR)].filter(
              Boolean
            ),
            administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
          },
          metadata: { legalizacionMtmId: String(leg._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (leg.estado === "aprobada") {
      await safeDispatch(
        `monitoria/aprobacion_legalizacion leg=${leg._id}`,
        {
          eventValue: "aprobacion_legalizacion_monitoria",
          tipo: "monitoria",
          datos: ctx.datos,
          recipientContext: { estudiante: ctx.estudianteEmail, postulante: ctx.estudianteEmail },
          metadata: { legalizacionMtmId: String(leg._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (leg.estado === "rechazada" || leg.estado === "en_ajuste") {
      const texto = String(leg.rechazoMotivo || "").trim() || "Replay legalización.";
      await safeDispatch(
        `monitoria/rechazo_legalizacion leg=${leg._id}`,
        {
          eventValue: "rechazo_legalizacion_monitoria",
          tipo: "monitoria",
          datos: { ...ctx.datos, COMENTARIO: texto, OBSERVACION: texto },
          recipientContext: { estudiante: ctx.estudianteEmail, postulante: ctx.estudianteEmail },
          metadata: { legalizacionMtmId: String(leg._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (leg.estado === "en_revision" && leg.documentos && typeof leg.documentos === "object") {
      for (const doc of Object.values(leg.documentos)) {
        if (doc?.estadoDocumento === "rechazado") {
          const motivo = String(doc.motivoRechazo || "").trim();
          await safeDispatch(
            `monitoria/rechazo_documento_legalizacion leg=${leg._id}`,
            {
              eventValue: "rechazo_documento_legalizacion_monitoria",
              tipo: "monitoria",
              datos: {
                ...ctx.datos,
                NOMBRE_DOCUMENTO: "Documento legalización",
                COMENTARIO: motivo,
                OBSERVACION: motivo,
              },
              recipientContext: { estudiante: ctx.estudianteEmail, postulante: ctx.estudianteEmail },
              metadata: { legalizacionMtmId: String(leg._id), source: "bulkDispatchFromDb" },
            },
            dryRun,
            stats
          );
          break;
        }
      }
    }
  }

  const planes = await PlanDeTrabajoMTM.find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  for (const plan of planes) {
    const ctx = await loadMtmPostulacionContext(plan.postulacionMTM);
    if (!ctx) continue;
    if (plan.estado === "borrador") {
      await safeDispatch(
        `monitoria/creacion_plan po=${plan.postulacionMTM}`,
        {
          eventValue: "creacion_plan_trabajo_monitoria",
          tipo: "monitoria",
          datos: ctx.datos,
          recipientContext: {
            docente: ctx.profEmail,
            coordinador: [ctx.profEmail, ...parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR)].filter(
              Boolean
            ),
            administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
          },
          metadata: { planMtmId: String(plan._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (plan.estado === "enviado_revision") {
      const revisionLink = `/dashboard/monitorias/revision/${String(plan.postulacionMTM)}`;
      await safeDispatch(
        `monitoria/envio_revision_plan po=${plan.postulacionMTM}`,
        {
          eventValue: "envio_revision_plan_trabajo_monitoria",
          tipo: "monitoria",
          datos: {
            ...ctx.datos,
            LINK: mtmFrontendLink(revisionLink),
            LINK_APROBAR_PLAN: mtmFrontendLink(revisionLink),
          },
          recipientContext: {
            docente: ctx.profEmail,
            coordinador: ctx.profEmail ? [ctx.profEmail] : [],
          },
          metadata: { planMtmId: String(plan._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (plan.estado === "aprobado") {
      await safeDispatch(
        `monitoria/aprobacion_plan po=${plan.postulacionMTM}`,
        {
          eventValue: "aprobacion_plan_trabajo_monitoria",
          tipo: "monitoria",
          datos: buildVariablesPlantillaMtmPlanCargo({
            nombreCargo: plan.nombreMonitor || plan.asignaturaArea,
            periodoCodigo: plan.periodo,
          }),
          recipientContext: {
            coordinador: [ctx.profEmail, ...parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR)].filter(
              Boolean
            ),
            administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
          },
          metadata: { planMtmId: String(plan._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (plan.estado === "rechazado") {
      // No existe un eventValue específico para rechazo de plan en el catálogo oficial actual.
    }
  }

  const segs = await SeguimientoMTM.find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  for (const seg of segs) {
    const ctx = await loadMtmPostulacionContext(seg.postulacionMTM);
    if (!ctx) continue;
    const extra = {
      TIPO_ACTIVIDAD: seg.tipoActividad || "",
      HORAS: seg.cantidadHoras != null ? String(seg.cantidadHoras) : "",
      FECHA: seg.fecha ? new Date(seg.fecha).toISOString().slice(0, 10) : "",
      OBSERVACION: seg.comentarios || "",
    };
    if (seg.estado === "pendiente_revision") {
      await safeDispatch(
        `monitoria/creacion_seguimiento seg=${seg._id}`,
        {
          eventValue: "creacion_seguimiento_monitoria_requiere_aprobacion",
          tipo: "monitoria",
          datos: { ...ctx.datos, ...extra },
          recipientContext: {
            docente: ctx.profEmail,
            coordinador: [ctx.profEmail, ...parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR)].filter(
              Boolean
            ),
            administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
          },
          metadata: { seguimientoMtmId: String(seg._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (seg.estado === "aprobado") {
      await safeDispatch(
        `monitoria/aprobacion_seguimiento seg=${seg._id}`,
        {
          eventValue: "aprobacion_seguimiento_monitoria",
          tipo: "monitoria",
          datos: { ...ctx.datos, ...extra },
          recipientContext: {
            estudiante: ctx.estudianteEmail,
            postulante: ctx.estudianteEmail,
            monitor_academico: ctx.estudianteEmail,
          },
          metadata: { seguimientoMtmId: String(seg._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
    if (seg.estado === "rechazado") {
      const m = String(seg.rechazoMotivo || "").trim();
      await safeDispatch(
        `monitoria/rechazo_seguimiento seg=${seg._id}`,
        {
          eventValue: "rechazo_seguimiento_monitoria",
          tipo: "monitoria",
          datos: { ...ctx.datos, ...extra, COMENTARIO: m, OBSERVACION: m },
          recipientContext: { estudiante: ctx.estudianteEmail, postulante: ctx.estudianteEmail },
          metadata: { seguimientoMtmId: String(seg._id), source: "bulkDispatchFromDb" },
        },
        dryRun,
        stats
      );
    }
  }

  const conLink = await PostulacionMTM.find({
    linkAsistenciaToken: { $exists: true, $nin: [null, ""] },
    estado: "aceptado_estudiante",
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  for (const po of conLink) {
    const ctx = await loadMtmPostulacionContext(po._id);
    if (!ctx) continue;
    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
    const link = `${String(baseUrl).replace(/\/$/, "")}/#/asistencia-mtm/${po.linkAsistenciaToken}`;
    await safeDispatch(
      `monitoria/envio_link_asistencia po=${po._id}`,
      {
        eventValue: "envio_link_asistencia_monitor",
        tipo: "monitoria",
        datos: { ...ctx.datos, LINK: link },
        recipientContext: { estudiante: ctx.estudianteEmail, postulante: ctx.estudianteEmail },
        metadata: { postulacionMtmId: String(po._id), source: "bulkDispatchFromDb" },
      },
      dryRun,
      stats
    );
  }
}

async function main() {
  const send = hasFlag("send");
  const dryRun = !send;
  const limit = Math.max(1, parseInt(argVal("limit", "5"), 10) || 5);
  const only = (argVal("only", "all") || "all").toLowerCase();
  DISPATCH_ONLY_ONCE_PER_EVENT = !hasFlag("all-records");
  DISPATCHED_EVENT_KEYS.clear();

  console.log("\n=== bulkDispatchNotificationsFromDb");
  console.log(`   modo: ${dryRun ? "DRY-RUN (añade --send para ejecutar)" : "ENVÍO REAL"}`);
  console.log(`   limit=${limit} only=${only}\n`);
  console.log(
    `   estrategia: ${DISPATCH_ONLY_ONCE_PER_EVENT ? "1 envío por eventValue en cada corrida" : "envío por cada registro (all-records)"}\n`
  );

  const stats = {
    attempted: 0,
    dispatched: 0,
    skippedNull: 0,
    errors: 0,
  };

  await connectDB();

  if (only === "all" || only === "general") {
    console.log("--- General ---");
    await runGeneral(limit, dryRun, stats);
  }
  if (only === "all" || only === "practica") {
    console.log("--- Practica ---");
    await runPractica(limit, dryRun, stats);
  }
  if (only === "all" || only === "monitoria") {
    console.log("--- Monitoria ---");
    await runMonitoria(limit, dryRun, stats);
  }

  console.log("\nResumen:");
  console.log(`  intentos de dispatch: ${stats.attempted}`);
  if (!dryRun) {
    console.log(`  llamadas con resultado no nulo: ${stats.dispatched}`);
    console.log(`  omitidas (sin evento/plantilla): ${stats.skippedNull}`);
    console.log(`  omitidas por duplicado de eventValue: ${stats.skippedDuplicateEvent || 0}`);
    console.log(`  errores: ${stats.errors}`);
  }
  console.log(
    dryRun
      ? "\nNo se envió nada. Ejecuta con --send para disparar correos/cola (¡puede generar muchos mensajes!).\n"
      : "\nListo.\n"
  );

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
