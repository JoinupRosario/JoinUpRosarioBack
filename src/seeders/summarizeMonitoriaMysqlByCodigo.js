/**
 * Resumen en JSON de la cadena monitoría en MySQL.
 *
 * Modos:
 * 1) Por oferta / study_working (como antes): opportunity.id = study_working_id
 *    node src/seeders/summarizeMonitoriaMysqlByCodigo.js 17420
 *
 * 2) Por legalización: monitoring_legalized_id (el "código" que muestra el legado en muchos casos)
 *    node src/seeders/summarizeMonitoriaMysqlByCodigo.js --legal 5861
 *    SUMMARY_MONITORIA_LEGALIZACION_ID=5861 node ...
 *
 * 3) Por uuid de monitoring_legalized (URL del legado)
 *    node src/seeders/summarizeMonitoriaMysqlByCodigo.js --uuid 73de1062-e729-4cc0-af79-1bb926f60bfb
 *
 * Salida opcional: SUMMARY_MONITORIA_OUT=./ruta.json
 * Requiere .env con MYSQL_*.
 *
 * El JSON incluye `vistaLegado`: mismos datos con textos de catálogo (ítems, facultad, programa,
 * periodo, usuarios, adjuntos) y estados legibles, además del detalle crudo por tabla.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import {
  mapMysqlChangeStatusOpportunityToMtmEstado,
  mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado,
  mapMysqlMonitoringPlanStatusToPlanTrabajoMtmEstado,
  mapMysqlLegalizacionDocumentoEstado,
  mapMysqlMonitoringActivityLogStatusToSeguimientoMtmEstado,
  mapMysqlOpportunityApplicationToPostulacionEstado,
} from "./mysqlChangeStatusMappers.js";

dotenv.config();

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown[]} ids */
function uniqPositiveInts(ids) {
  const s = new Set();
  for (const x of ids) {
    const n = num(x);
    if (n != null && n > 0) s.add(n);
  }
  return [...s];
}

function formatDateOnly(iso) {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Fecha actividad como en grilla legado: DD/MM/YYYY */
function formatDateDdMmYyyy(iso) {
  const ymd = formatDateOnly(iso);
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

/**
 * Fecha/hora registro en zona Bogotá, cercana a la columna "Estado" del listado de seguimientos.
 * (Ej. pantalla: 06/02/2026 10:33:05 AM)
 */
function formatDateTimeBogotaAmPm(iso) {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return null;
  }
}

/** Etiquetas de estado en historial / fila legalización (convención JoinUp legado). */
const STATUS_LEGALIZACION_MYSQL_UI = Object.freeze({
  CREATED: "Creada",
  REVIEWING: "En revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  ADJUSTMENT: "En ajuste",
  IN_ADJUSTMENT: "En ajuste",
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  PENDING_REVIEW: "En revisión",
  LEGALIZED: "Legalizada",
  CANCELLED: "Cancelada",
  CANCELED: "Cancelada",
});

/** Estado actual en fila `monitoring_legalized.status` (puede coincidir con el historial). */
const MONITORING_LEGALIZED_ROW_STATUS_UI = STATUS_LEGALIZACION_MYSQL_UI;

const DOCUMENT_STATUS_MYSQL_UI = Object.freeze({
  PENDING_APPROVAL: "Pendiente de aprobación",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  PENDING: "Pendiente",
});

const APPROVAL_DOC_STATUS_MYSQL_UI = Object.freeze({
  PENDING_APPROVAL: "Pendiente de aprobación",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
});

const PLAN_TRABAJO_MONGO_A_UI = Object.freeze({
  borrador: "En edición",
  enviado_revision: "Enviado a revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
});

const SEGUIMIENTO_ACTIVIDAD_MONGO_A_UI = Object.freeze({
  pendiente_revision: "Pendiente de revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
});

const POSTULACION_MONGO_A_UI = Object.freeze({
  aplicado: "Aplicado",
  empresa_consulto_perfil: "Empresa consultó perfil",
  empresa_descargo_hv: "Empresa descargó hoja de vida",
  seleccionado_empresa: "Seleccionado por la empresa",
  aceptado_estudiante: "Aceptado por el estudiante",
  rechazado: "Rechazado",
});

const TRACING_STATUS_MYSQL_UI = Object.freeze({
  CREATED: "Creado",
  IN_PROGRESS: "En curso",
  FINISHED: "Finalizado",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
});

function legalizacionStatusMysqlToUi(raw) {
  if (raw == null || raw === "") return null;
  const k = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  if (STATUS_LEGALIZACION_MYSQL_UI[k]) return STATUS_LEGALIZACION_MYSQL_UI[k];
  const mongo = mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(raw);
  const map = { creada: "Creada", borrador: "Creada", en_revision: "En revisión", aprobada: "Aprobada", rechazada: "Rechazada", en_ajuste: "En ajuste" };
  return map[mongo] || String(raw);
}

function documentStatusMysqlToUi(raw) {
  if (raw == null || raw === "") return null;
  const k = String(raw).trim().toUpperCase();
  if (DOCUMENT_STATUS_MYSQL_UI[k]) return DOCUMENT_STATUS_MYSQL_UI[k];
  const mongo = mapMysqlLegalizacionDocumentoEstado(raw);
  return mongo === "pendiente" ? "Pendiente" : mongo === "aprobado" ? "Aprobado" : mongo === "rechazado" ? "Rechazado" : String(raw);
}

function approvalDocStatusMysqlToUi(raw) {
  if (raw == null || raw === "") return null;
  const k = String(raw).trim().toUpperCase();
  if (APPROVAL_DOC_STATUS_MYSQL_UI[k]) return APPROVAL_DOC_STATUS_MYSQL_UI[k];
  return documentStatusMysqlToUi(raw);
}

function planTrabajoEstadoUi(raw) {
  const mongo = mapMysqlMonitoringPlanStatusToPlanTrabajoMtmEstado(raw);
  return PLAN_TRABAJO_MONGO_A_UI[mongo] || String(raw ?? "");
}

function actividadSeguimientoEstadoUi(raw) {
  const mongo = mapMysqlMonitoringActivityLogStatusToSeguimientoMtmEstado(raw);
  return SEGUIMIENTO_ACTIVIDAD_MONGO_A_UI[mongo] || String(raw ?? "");
}

function tracingStatusMysqlToUi(raw) {
  if (raw == null || raw === "") return null;
  const k = String(raw).trim().toUpperCase();
  if (TRACING_STATUS_MYSQL_UI[k]) return TRACING_STATUS_MYSQL_UI[k];
  return String(raw);
}

/** @param {Record<string, unknown>|null|undefined} row */
function usuarioResumen(row) {
  if (!row) return null;
  const id = num(row.id);
  const name = [row.name, row.last_name].filter(Boolean).join(" ").trim();
  return {
    id,
    nombreCompleto: name || null,
    correoInstitucional: row.user_name ?? null,
    correoPersonal: row.personal_email ?? null,
    documento: row.identification ?? null,
    telefonoMovil: row.movil ?? null,
    telefonoFijo: row.phone ?? null,
  };
}

/** @param {Map<number, Record<string, unknown>>} itemMap */
function itemEtiqueta(itemMap, id) {
  const n = num(id);
  if (n == null) return null;
  const r = itemMap.get(n);
  return r ? String(r.value ?? "") || null : null;
}

async function fetchItemMap(ids) {
  const u = uniqPositiveInts(ids);
  if (!u.length) return new Map();
  const ph = u.map(() => "?").join(",");
  const rows = await query(`SELECT id, value, list_id, description FROM item WHERE id IN (${ph})`, u);
  const m = new Map();
  for (const r of rows || []) m.set(num(r.id), r);
  return m;
}

async function fetchUserMap(ids) {
  const u = uniqPositiveInts(ids);
  if (!u.length) return new Map();
  const ph = u.map(() => "?").join(",");
  const rows = await query(
    `SELECT id, name, last_name, user_name, personal_email, identification, movil, phone FROM user WHERE id IN (${ph})`,
    u
  );
  const m = new Map();
  for (const r of rows || []) m.set(num(r.id), r);
  return m;
}

async function fetchProgramMap(ids) {
  const u = uniqPositiveInts(ids);
  if (!u.length) return new Map();
  const ph = u.map(() => "?").join(",");
  const rows = await query(`SELECT id, code, name FROM program WHERE id IN (${ph})`, u);
  const m = new Map();
  for (const r of rows || []) m.set(num(r.id), r);
  return m;
}

async function fetchFacultyMap(ids) {
  const u = uniqPositiveInts(ids);
  if (!u.length) return new Map();
  const ph = u.map(() => "?").join(",");
  const rows = await query(`SELECT faculty_id, code, name FROM faculty WHERE faculty_id IN (${ph})`, u);
  const m = new Map();
  for (const r of rows || []) m.set(num(r.faculty_id), r);
  return m;
}

async function fetchAcademicPeriodMap(ids) {
  const u = uniqPositiveInts(ids);
  if (!u.length) return new Map();
  const ph = u.map(() => "?").join(",");
  const rows = await query(`SELECT id, period FROM academic_period WHERE id IN (${ph})`, u);
  const m = new Map();
  for (const r of rows || []) m.set(num(r.id), r);
  return m;
}

async function fetchCourseMap(ids) {
  const u = uniqPositiveInts(ids);
  if (!u.length) return new Map();
  const ph = u.map(() => "?").join(",");
  const rows = await query(`SELECT id, code, name FROM course WHERE id IN (${ph})`, u);
  const m = new Map();
  for (const r of rows || []) m.set(num(r.id), r);
  return m;
}

async function fetchAttachmentMap(ids) {
  const u = uniqPositiveInts(ids);
  if (!u.length) return new Map();
  const ph = u.map(() => "?").join(",");
  const rows = await query(`SELECT id, name FROM attachment WHERE id IN (${ph})`, u);
  const m = new Map();
  for (const r of rows || []) m.set(num(r.id), r);
  return m;
}

/**
 * JSON alineado a pantallas legado: textos de catálogo, nombres de archivo, estados legibles.
 * Los bloques `opportunity`, `monitoringLegalizations`, etc. se mantienen para trazabilidad.
 */
async function buildVistaLegado(out) {
  const sw = out.studyWorking;
  const opp = out.opportunity;
  const itemIds = [];
  if (sw) {
    itemIds.push(sw.dedication_hours, sw.remuneration_hour_per_week, sw.contract_type, sw.category);
  }
  const userIds = [];
  const programIds = (out.opportunityPrograms || []).map((p) => p.program_id);
  const facultyIds = [];
  const periodIds = [];
  const courseIds = [];
  if (sw?.course != null) courseIds.push(sw.course);

  for (const det of out.monitoringLegalizations || []) {
    const ml = det.monitoring_legalized;
    if (!ml) continue;
    itemIds.push(
      ml.category,
      ml.dedication_hours,
      ml.remuneration_hour_per_week,
      ml.account_type,
      ml.fin_bank,
      ml.eps,
      ml.residence_area
    );
    userIds.push(ml.user_coordinator, ml.user_teacher);
    programIds.push(ml.program_ml);
    facultyIds.push(ml.faculty_ml);
    periodIds.push(ml.period_ml);
    if (ml.course != null) courseIds.push(ml.course);

    for (const c of det.change_status_monitoring_legalized || []) userIds.push(c.user_id);
    for (const a of det.approval_monitoring_documents || []) userIds.push(a.user_id);
    for (const log of det.monitoring_activity_log || []) itemIds.push(log.activity_type);
  }

  const [itemMap, userMap, programMap, facultyMap, periodMap, courseMap] = await Promise.all([
    fetchItemMap(itemIds),
    fetchUserMap(userIds),
    fetchProgramMap(programIds),
    fetchFacultyMap(facultyIds),
    fetchAcademicPeriodMap([...(sw?.period_sw != null ? [sw.period_sw] : []), ...periodIds]),
    fetchCourseMap(courseIds),
  ]);

  const postulantTargetId = num(out.meta?.postulant_ml_esta_legalizacion);
  const postRow =
    (out.postulantsPorAplicacion || []).find((p) => num(p.postulant_id) === postulantTargetId) ||
    (out.postulantsPorAplicacion || [])[0] ||
    null;
  const profiles = (out.postulantProfilesResumen || []).filter((pr) => num(pr.postulant_id) === num(postRow?.postulant_id));
  const appRow =
    (out.opportunityApplications || []).find((a) => num(a.postulant_id) === num(postRow?.postulant_id)) ||
    (out.opportunityApplications || [])[0] ||
    null;

  const programasOferta = (out.opportunityPrograms || [])
    .map((op) => {
      const pid = num(op.program_id);
      const p = pid != null ? programMap.get(pid) : null;
      return {
        id: pid,
        codigo: p?.code ?? null,
        nombre: p?.name ?? null,
      };
    })
    .filter((x) => x.id != null);

  const periodoOfertaId = num(sw?.period_sw);
  const periodoOferta = periodoOfertaId != null ? periodMap.get(periodoOfertaId) : null;

  const allAttachmentIds = [];
  for (const det of out.monitoringLegalizations || []) {
    for (const d of det.document_monitoring || []) allAttachmentIds.push(d.document_attached_id);
    for (const log of det.monitoring_activity_log || []) {
      allAttachmentIds.push(log.first_attachment, log.second_attachment);
    }
    for (const t of det.tracing_monitoring || []) allAttachmentIds.push(t.document_final_tracing);
  }
  const attMapGlobal = await fetchAttachmentMap(allAttachmentIds);

  const legalizacionesVista = [];

  for (const det of out.monitoringLegalizations || []) {
    const ml = det.monitoring_legalized;
    if (!ml) continue;

    const mlId = num(ml.monitoring_legalized_id);
    const pid = num(ml.program_ml);
    const fid = num(ml.faculty_ml);
    const perId = num(ml.period_ml);
    const crsId = num(ml.course);
    const catLabel = itemEtiqueta(itemMap, ml.category) || "";
    const asigNombre = crsId != null && courseMap.get(crsId) ? String(courseMap.get(crsId).name || "") : "";
    const categoriaAsignaturaGrilla = `${catLabel}/` + asigNombre;
    const progName = pid != null && programMap.get(pid) ? String(programMap.get(pid).name || "") : "";
    const perText = perId != null && periodMap.get(perId) ? String(periodMap.get(perId).period || "") : "";
    const periodoComoEnGrilla = [progName, perText].every(Boolean) ? `${progName} - ${perText}` : [progName, perText].filter(Boolean).join(" - ") || null;

    const mlStatusKey = String(ml.status ?? "").trim().toUpperCase();
    const documentosUi = (det.document_monitoring || []).map((d) => ({
      definicionDocumento: d.documento_definicion_nombre ?? null,
      nombreArchivo: d.documento_archivo_nombre ?? null,
      estadoMysql: d.document_status ?? null,
      estadoEtiqueta: documentStatusMysqlToUi(d.document_status),
      ids: {
        document_monitoring_definition_id: d.document_monitoring_definition_id,
        document_attached_id: d.document_attached_id,
      },
    }));

    legalizacionesVista.push({
      codigoLegalizacion: mlId,
      uuid: ml.uuid ?? null,
      titulo: ml.monitoring_title ?? null,
      estado: {
        mysql: ml.status ?? null,
        etiqueta:
          MONITORING_LEGALIZED_ROW_STATUS_UI[mlStatusKey] || legalizacionStatusMysqlToUi(ml.status),
      },
      fechas: {
        creacion: ml.date_creation ?? null,
        aprobacion: ml.date_approval_ml ?? null,
        ultimaActualizacion: ml.date_updater ?? null,
      },
      academicos: {
        facultad: fid != null && facultyMap.get(fid) ? { id: fid, codigo: facultyMap.get(fid).code, nombre: facultyMap.get(fid).name } : { id: fid, codigo: null, nombre: null },
        programa:
          pid != null && programMap.get(pid)
            ? { id: pid, codigo: programMap.get(pid).code, nombre: programMap.get(pid).name }
            : { id: pid, codigo: null, nombre: null },
        periodoAcademico: perId != null && periodMap.get(perId) ? { id: perId, texto: periodMap.get(perId).period } : { id: perId, texto: null },
        asignatura:
          crsId != null && courseMap.get(crsId)
            ? { id: crsId, codigo: courseMap.get(crsId).code, nombre: courseMap.get(crsId).name }
            : { id: crsId, codigo: null, nombre: null },
      },
      catalogosMonitoria: {
        categoria: itemEtiqueta(itemMap, ml.category),
        dedicacionHoraria: itemEtiqueta(itemMap, ml.dedication_hours),
        horasSemanales: itemEtiqueta(itemMap, ml.remuneration_hour_per_week),
        eps: itemEtiqueta(itemMap, ml.eps),
        banco: itemEtiqueta(itemMap, ml.fin_bank),
        tipoCuenta: itemEtiqueta(itemMap, ml.account_type),
        areaResidencia: itemEtiqueta(itemMap, ml.residence_area),
      },
      datosContactoResponsables: {
        responsableNombre: ml.responsable ?? null,
        responsableCorreo: ml.mail_responsable ?? null,
        localidad: ml.locality ?? null,
        centroCosto: ml.cost_center ?? null,
        limiteHoras: ml.hour_limit ?? null,
      },
      coordinadorInstitucional: usuarioResumen(userMap.get(num(ml.user_coordinator))),
      docenteAsignatura: usuarioResumen(userMap.get(num(ml.user_teacher))),
        datosFinancieros: {
          numeroCuenta: ml.fin_account_number || null,
          contratoFinanciero: ml.fin_contract || null,
        },
        /** Repite columnas fijas que la grilla muestra en cada fila de seguimiento */
        contextoGrillaSeguimientos: {
          codigo: postRow?.identification ?? null,
          categoriaAsignatura: categoriaAsignaturaGrilla,
          periodo: periodoComoEnGrilla,
        },
        documentos: documentosUi,
      historialCambiosEstado: (det.change_status_monitoring_legalized || []).map((c) => {
        const uid = num(c.user_id);
        const beforeRaw = c.status_legalized_before;
        const afterRaw = c.status_legalized_after;
        return {
          fecha: c.change_status_date ?? null,
          usuario: usuarioResumen(userMap.get(uid)) || { id: uid },
          antes: {
            mysql: beforeRaw ?? null,
            etiqueta: beforeRaw != null && beforeRaw !== "" ? legalizacionStatusMysqlToUi(beforeRaw) : null,
          },
          despues: {
            mysql: afterRaw ?? null,
            etiqueta: afterRaw != null && afterRaw !== "" ? legalizacionStatusMysqlToUi(afterRaw) : null,
          },
          observacion: c.change_status_observation ?? null,
          observacionDocumento: c.change_status_observation_document ?? null,
        };
      }),
      planesDeTrabajo: (det.monitoring_planes || []).map((p) => ({
        id: p.id ?? null,
        estado: { mysql: p.status ?? null, etiqueta: planTrabajoEstadoUi(p.status) },
        aprobado: p.approved ?? null,
        fechaAprobacion: p.date_approved ?? null,
        resumen: p.summary ?? null,
        competenciasGenerales: p.general_skills ?? null,
        competenciasEspecificas: p.specific_skills ?? null,
        objetivoGeneral: p.general_objective ?? null,
        objetivosEspecificos: p.specific_objectives ?? null,
        observaciones: p.observations ?? null,
        cronograma: (p.cronograma || []).map((row) => ({
          fecha: formatDateOnly(row.date),
          tema: row.monitoring_theme ?? null,
          estrategias: row.monitoring_strategies ?? null,
          actividades: row.monitoring_activities ?? null,
        })),
      })),
      seguimiento: (det.tracing_monitoring || []).map((t) => {
        const tid = num(t.tracing_monitoring_id);
        const docId = num(t.document_final_tracing);
        const doc = docId != null ? attMapGlobal.get(docId) : null;
        return {
          id: tid,
          estadoMysql: t.tracing_status ?? null,
          estadoEtiqueta: tracingStatusMysqlToUi(t.tracing_status),
          resumen: t.summary ?? null,
          notaCuantitativa: t.quantitative_note ?? null,
          notaCualitativa: t.qualitative_note ?? null,
          documentoFinal: doc ? { id: docId, nombreArchivo: doc.name } : { id: docId, nombreArchivo: null },
          fechaCreacion: t.date_creation ?? null,
        };
      }),
      registroActividades: (det.monitoring_activity_log || []).map((log) => {
        const a1 = num(log.first_attachment);
        const a2 = num(log.second_attachment);
        const etiquetaEstado = actividadSeguimientoEstadoUi(log.status);
        const fechaHoraRegistro = formatDateTimeBogotaAmPm(log.date_creation);
        const fechaAprob = log.date_approved_activity != null ? formatDateTimeBogotaAmPm(log.date_approved_activity) : null;
        return {
          id: log.activity_log_id ?? null,
          fechaActividad: formatDateOnly(log.activity_date),
          fechaActividadGrilla: formatDateDdMmYyyy(log.activity_date),
          tipoActividad: itemEtiqueta(itemMap, log.activity_type),
          observacion: log.observation_activity ?? null,
          estadoMysql: log.status ?? null,
          estadoEtiqueta: etiquetaEstado,
          /** Columna "Estado": en legado suele mostrarse fecha/hora de registro + etiqueta */
          estadoEnGrilla: {
            fechaHoraRegistro,
            etiqueta: etiquetaEstado,
            textoPlano: [fechaHoraRegistro, etiquetaEstado].filter(Boolean).join(" "),
          },
          /** Columna "Fecha seguimiento": en BD es `date_approved_activity`; si no hay, la UI muestra "NO" */
          fechaSeguimientoGrilla: fechaAprob ?? "NO",
          fechaAprobacionActividadIso: log.date_approved_activity ?? null,
          fechaRegistroIso: log.date_creation ?? null,
          horas: log.hour_count ?? null,
          estudiantesAtendidos: log.student_count ?? null,
          convocatoriaEstudiantes: log.called_student_count ?? null,
          adjuntos: {
            primero:
              a1 != null && attMapGlobal.get(a1)
                ? { id: a1, nombreArchivo: attMapGlobal.get(a1).name }
                : { id: a1, nombreArchivo: null },
            segundo:
              a2 != null && attMapGlobal.get(a2)
                ? { id: a2, nombreArchivo: attMapGlobal.get(a2).name }
                : { id: a2, nombreArchivo: null },
          },
        };
      }),
      historialAprobacionDocumentos: (det.approval_monitoring_documents || []).map((a) => ({
        fecha: a.approval_date ?? null,
        usuario: usuarioResumen(userMap.get(num(a.user_id))) || { id: num(a.user_id) },
        documentoDefinicionId: a.document_monitoring_definition_id ?? null,
        antes: { mysql: a.approval_document_status_before ?? null, etiqueta: approvalDocStatusMysqlToUi(a.approval_document_status_before) },
        despues: { mysql: a.approval_document_status_after ?? null, etiqueta: approvalDocStatusMysqlToUi(a.approval_document_status_after) },
        observacion: a.approval_observation ?? null,
      })),
    });
  }

  return {
    oferta: opp
      ? {
          id: num(opp.id),
          titulo: opp.job_title ?? null,
          empresa: opp.company_nombre ?? null,
          estado: {
            mysql: opp.status ?? null,
            etiquetaOportunidadMtm: mapMysqlChangeStatusOpportunityToMtmEstado(opp.status),
          },
          tipo: opp.opportunity_type ?? null,
          periodoAcademico: periodoOferta ? { id: periodoOfertaId, texto: periodoOferta.period } : { id: periodoOfertaId, texto: null },
          catalogosOferta: sw
            ? {
                categoria: itemEtiqueta(itemMap, sw.category),
                dedicacionHoraria: itemEtiqueta(itemMap, sw.dedication_hours),
                horasSemanales: itemEtiqueta(itemMap, sw.remuneration_hour_per_week),
                tipoContrato: itemEtiqueta(itemMap, sw.contract_type),
                asignatura:
                  num(sw.course) != null && courseMap.get(num(sw.course))
                    ? {
                        id: num(sw.course),
                        codigo: courseMap.get(num(sw.course)).code,
                        nombre: courseMap.get(num(sw.course)).name,
                      }
                    : { id: num(sw.course), codigo: null, nombre: null },
              }
            : null,
          profesorResponsableTexto: sw?.teacher_responsable ?? null,
        }
      : null,
    programasConvocatoria: programasOferta,
    estudiante: postRow
      ? {
          id: num(postRow.postulant_id),
          nombreCompleto: [postRow.name, postRow.last_name].filter(Boolean).join(" ").trim() || null,
          correoInstitucional: postRow.user_name ?? null,
          correo: postRow.personal_email ?? null,
          documento: postRow.identification ?? null,
          telefonoMovil: postRow.movil ?? postRow.user_phone ?? null,
          telefonoPostulante: postRow.postulant_phone ?? null,
          codigosEstudiante: profiles.map((p) => p.student_code).filter(Boolean),
          estadoPostulacion: appRow
            ? {
                mysql: appRow.status ?? null,
                etiquetaMongo: mapMysqlOpportunityApplicationToPostulacionEstado(appRow),
                etiqueta: POSTULACION_MONGO_A_UI[mapMysqlOpportunityApplicationToPostulacionEstado(appRow)] || mapMysqlOpportunityApplicationToPostulacionEstado(appRow),
              }
            : null,
        }
      : null,
    cambiosEstadoOportunidad: (out.changeStatusOpportunity || []).map((c) => ({
      fecha: c.date ?? null,
      antes: c.status_before ?? null,
      despues: c.status_after ?? null,
      etiquetaAntes:
        c.status_before != null && c.status_before !== ""
          ? mapMysqlChangeStatusOpportunityToMtmEstado(c.status_before)
          : null,
      etiquetaDespues:
        c.status_after != null && c.status_after !== ""
          ? mapMysqlChangeStatusOpportunityToMtmEstado(c.status_after)
          : null,
    })),
    legalizaciones: legalizacionesVista,
  };
}

/** @returns {{ modo: 'oportunidad' | 'legalizacion', studyWorkingId: number | null, legalizacionFila: object | null, opportunityArg: number | null }} */
function parseCli() {
  const argv = process.argv.slice(2);
  let legalId = num(process.env.SUMMARY_MONITORIA_LEGALIZACION_ID);
  let legalUuid = process.env.SUMMARY_MONITORIA_LEGALIZACION_UUID?.trim() || null;
  let opportunityId = num(process.env.SUMMARY_MONITORIA_CODIGO);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--legalizacion" || a === "--legal") {
      legalId = num(argv[++i]);
    } else if (a === "--uuid") {
      legalUuid = argv[++i]?.trim() || null;
    } else if (a === "--oportunidad" || a === "--opp") {
      opportunityId = num(argv[++i]);
    } else if (!a.startsWith("-")) {
      const n = num(a);
      if (n != null && opportunityId == null && legalId == null && !legalUuid) {
        opportunityId = n;
      }
    }
  }

  const tieneLegal =
    Boolean(legalUuid?.length) || (legalId != null && Number.isFinite(legalId) && legalId > 0);
  if (tieneLegal) {
    return {
      modo: "legalizacion",
      studyWorkingId: null,
      legalizacionFila: null,
      legalId,
      legalUuid,
      opportunityArg: opportunityId,
    };
  }

  if (opportunityId == null || !Number.isFinite(opportunityId) || opportunityId <= 0) {
    return {
      modo: "oportunidad",
      studyWorkingId: null,
      legalizacionFila: null,
      legalId: null,
      legalUuid: null,
      opportunityArg: null,
    };
  }

  return {
    modo: "oportunidad",
    studyWorkingId: opportunityId,
    legalizacionFila: null,
    legalId: null,
    legalUuid: null,
    opportunityArg: opportunityId,
  };
}

async function fetchLegalizacionRow(legalId, legalUuid) {
  if (legalUuid) {
    const rows = await query(`SELECT * FROM monitoring_legalized WHERE uuid = ? LIMIT 1`, [legalUuid]);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  if (legalId != null && legalId > 0) {
    const rows = await query(`SELECT * FROM monitoring_legalized WHERE monitoring_legalized_id = ? LIMIT 1`, [
      legalId,
    ]);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  return null;
}

async function buildLegalizationDetail(ml) {
  const mlId = ml.monitoring_legalized_id;

  const docs = await query(
    `SELECT dm.*, dmd.document_name AS documento_definicion_nombre, att.name AS documento_archivo_nombre
     FROM document_monitoring dm
     INNER JOIN document_monitoring_definition dmd ON dmd.document_monitoring_definition_id = dm.document_monitoring_definition_id
     INNER JOIN attachment att ON att.id = dm.document_attached_id
     WHERE dm.monitoring_legalized_id = ?
     ORDER BY dm.document_monitoring_definition_id`,
    [mlId]
  );

  const css = await query(
    `SELECT * FROM change_status_monitoring_legalized WHERE monitoring_legalized_id = ? ORDER BY change_status_date ASC, change_status_monitoring_legalized_id ASC`,
    [mlId]
  );

  const plans = await query(`SELECT * FROM monitoring_plan WHERE monitoring_legalized_id = ? ORDER BY id`, [mlId]);
  const planesConCronograma = [];
  for (const p of plans || []) {
    const sched = await query(
      `SELECT * FROM monitoring_plan_schedule WHERE monitoring_plan_id = ? ORDER BY \`date\` ASC, id ASC`,
      [p.id]
    );
    planesConCronograma.push({ ...p, cronograma: sched || [] });
  }

  const tracing = await query(
    `SELECT * FROM tracing_monitoring WHERE monitoring_legalized_id = ? ORDER BY tracing_monitoring_id`,
    [mlId]
  );
  const tracingList = tracing || [];
  const tracingIds = tracingList.map((t) => t.tracing_monitoring_id).filter(Boolean);

  let activityLogs = [];
  if (tracingIds.length) {
    const placeholders = tracingIds.map(() => "?").join(",");
    const logs = await query(
      `SELECT * FROM monitoring_activity_log WHERE tracing_monitoring_id IN (${placeholders}) ORDER BY activity_log_id`,
      tracingIds
    );
    activityLogs = logs || [];
  }

  let activityAssistances = [];
  const logIds = (activityLogs || []).map((l) => l.activity_log_id).filter(Boolean);
  if (logIds.length) {
    const lp = logIds.map(() => "?").join(",");
    const asst = await query(
      `SELECT * FROM monitoring_activity_assistance WHERE activity_log_id IN (${lp}) ORDER BY activity_log_id`,
      logIds
    );
    activityAssistances = asst || [];
  }

  const approvals = await query(
    `SELECT * FROM approval_monitoring_documents WHERE monitoring_legalized_id = ? ORDER BY approval_date ASC, approval_document_id ASC`,
    [mlId]
  );

  return {
    monitoring_legalized: ml,
    document_monitoring: docs || [],
    change_status_monitoring_legalized: css || [],
    monitoring_planes: planesConCronograma,
    tracing_monitoring: tracingList,
    monitoring_activity_log: activityLogs,
    monitoring_activity_assistance: activityAssistances,
    approval_monitoring_documents: approvals || [],
  };
}

async function main() {
  const parsed = parseCli();

  await connectMySQL();

  try {
    let studyWorkingId = parsed.studyWorkingId;
    let legalizacionAncla = parsed.legalizacionFila;
    let soloEstaLegalizacion = false;

    const porLegal =
      parsed.modo === "legalizacion" ||
      (parsed.legalId != null && Number.isFinite(parsed.legalId) && parsed.legalId > 0) ||
      Boolean(parsed.legalUuid?.length);
    if (porLegal) {
      legalizacionAncla = await fetchLegalizacionRow(parsed.legalId, parsed.legalUuid);
      if (!legalizacionAncla) {
        console.error(
          "No se encontró monitoring_legalized con el id/uuid indicado. Use --legal <monitoring_legalized_id> o --uuid <uuid>."
        );
        process.exit(1);
      }
      studyWorkingId = num(legalizacionAncla.study_working_id);
      soloEstaLegalizacion = true;
      if (studyWorkingId == null || studyWorkingId <= 0) {
        console.error("La legalización no tiene study_working_id; no se puede cargar la oferta.");
        process.exit(1);
      }
    }

    if (studyWorkingId == null || studyWorkingId <= 0) {
      console.error(
        "Indique oportunidad/study_working (número) o --legal / --uuid. Ej: node ... 17420   o   node ... --legal 5861"
      );
      process.exit(1);
    }

    const codigo = studyWorkingId;

    const out = {
      meta: {
        modo: soloEstaLegalizacion ? "legalizacion" : "oportunidad_study_working",
        monitoring_legalized_id: legalizacionAncla?.monitoring_legalized_id ?? null,
        monitoring_legalized_uuid: legalizacionAncla?.uuid ?? null,
        study_working_id_opportunity_id: codigo,
        postulant_ml_esta_legalizacion: legalizacionAncla?.postulant_ml ?? null,
        nota:
          soloEstaLegalizacion
            ? "Contexto de oferta vía study_working_id; monitoringLegalizations solo incluye esta fila."
            : "study_working_id y job_offer_id suelen coincidir con opportunity.id en MTM.",
        generadoEn: new Date().toISOString(),
        mysqlDatabase: process.env.MYSQL_DATABASE || "tenant-1",
      },
      opportunity: null,
      studyWorking: null,
      jobOffer: null,
      jobOfferOpportunityLanguages: [],
      opportunityPrograms: [],
      opportunityApplications: [],
      postulantsPorAplicacion: [],
      postulantProfilesResumen: [],
      changeStatusOpportunity: [],
      monitoringLegalizations: [],
      vistaLegado: null,
    };

    const oppRows = await query(
      `SELECT o.*, COALESCE(NULLIF(TRIM(c.trade_name), ''), NULLIF(TRIM(c.business_name), '')) AS company_nombre
       FROM opportunity o
       LEFT JOIN company c ON c.id = o.company_id
       WHERE o.id = ?`,
      [codigo]
    );
    out.opportunity = Array.isArray(oppRows) && oppRows.length ? oppRows[0] : null;

    const swRows = await query(`SELECT * FROM study_working WHERE study_working_id = ?`, [codigo]);
    out.studyWorking = Array.isArray(swRows) && swRows.length ? swRows[0] : null;

    const joRows = await query(`SELECT * FROM job_offer WHERE job_offer_id = ?`, [codigo]);
    out.jobOffer = Array.isArray(joRows) && joRows.length ? joRows[0] : null;

    const joolRows = await query(
      `SELECT jol.*, ol.language_id, ol.level_id
       FROM job_offer_opportunity_language jol
       INNER JOIN opportunity_language ol ON ol.id = jol.opportunity_language_id
       WHERE jol.job_offer_id = ?`,
      [codigo]
    );
    out.jobOfferOpportunityLanguages = joolRows || [];

    const progRows = await query(
      `SELECT * FROM opportunity_programs WHERE opportunity_id = ? ORDER BY program_id`,
      [codigo]
    );
    out.opportunityPrograms = progRows || [];

    let appRows = await query(
      `SELECT * FROM opportunity_application WHERE opportunity_id = ? ORDER BY id`,
      [codigo]
    );
    if (soloEstaLegalizacion && legalizacionAncla?.postulant_ml != null) {
      const pid = num(legalizacionAncla.postulant_ml);
      out.opportunityApplications = (appRows || []).filter((a) => num(a.postulant_id) === pid);
      out.meta.opportunityApplicationsScope = "solo_postulant_ml_de_esta_legalizacion";
    } else {
      out.opportunityApplications = appRows || [];
    }

    const postulantIds = [
      ...new Set((out.opportunityApplications || []).map((a) => num(a.postulant_id)).filter((n) => n != null && n > 0)),
    ];
    if (soloEstaLegalizacion && legalizacionAncla?.postulant_ml != null) {
      const pml = num(legalizacionAncla.postulant_ml);
      if (pml && !postulantIds.includes(pml)) postulantIds.push(pml);
    }
    if (postulantIds.length) {
      const ph = postulantIds.map(() => "?").join(",");
      const pRows = await query(
        `SELECT p.postulant_id, u.name, u.last_name, u.user_name, u.personal_email, u.identification, u.movil, u.phone AS user_phone, p.phone AS postulant_phone, p.alternate_email
         FROM postulant p
         INNER JOIN user u ON u.id = p.postulant_id
         WHERE p.postulant_id IN (${ph})`,
        postulantIds
      );
      out.postulantsPorAplicacion = pRows || [];
      const profRows = await query(
        `SELECT postulant_id, student_code, academic_user FROM postulant_profile WHERE postulant_id IN (${ph}) ORDER BY postulant_id, id`,
        postulantIds
      );
      out.postulantProfilesResumen = profRows || [];
    }

    const csoRows = await query(
      `SELECT * FROM change_status_opportunity WHERE opportunity_id = ? ORDER BY \`date\` ASC, id ASC`,
      [codigo]
    );
    out.changeStatusOpportunity = csoRows || [];

    let legalizations;
    if (soloEstaLegalizacion && legalizacionAncla) {
      legalizations = [legalizacionAncla];
    } else {
      const mlRows = await query(
        `SELECT * FROM monitoring_legalized WHERE study_working_id = ? ORDER BY monitoring_legalized_id`,
        [codigo]
      );
      legalizations = mlRows || [];
    }

    for (const ml of legalizations) {
      out.monitoringLegalizations.push(await buildLegalizationDetail(ml));
    }

    out.vistaLegado = await buildVistaLegado(out);

    const text = JSON.stringify(out, null, 2);
    console.log(text);

    const outPath = process.env.SUMMARY_MONITORIA_OUT?.trim();
    if (outPath) {
      const resolved = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, text, "utf8");
      console.error(`\n[summarize-monitoria] Guardado también en: ${resolved}`);
    }
  } finally {
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
