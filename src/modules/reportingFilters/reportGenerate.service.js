import { REPORT_FILTER_DEFINITIONS } from "./reportFilterDefinitions.js";
import { buildAppliedFilterLines } from "./reportAppliedFilters.service.js";
import { executeReportData } from "./reportExecuteData.service.js";

const REPORT_TITLES = {
  "mon-detalle-ofertas": "Detalle de ofertas de monitorías",
  "mon-detallado-legalizaciones": "Detallado legalizaciones de monitorías",
  "mon-seguimiento": "Seguimiento monitorías",
  "mon-aplicaciones-ofertas": "Aplicaciones de ofertas de monitorías",
  "mon-evaluaciones": "Evaluaciones monitorías",
  "mon-historico": "Histórico monitorías",
  "mon-estadistico": "Estadístico monitorías",
  "mon-graduados": "Graduados con monitorías, tutorías y mentorías",
  "mon-planes-trabajo": "Reporte de planes de trabajo",
  "mon-asistencia": "Reporte de asistencia",
  "mon-daf-vinculacion": "Informe DAF Vinculación",
  "mon-resumen-legalizaciones-mtm": "Resumen legalizaciones MTM",
  "prac-detalle-oportunidades": "Detalle de oportunidades",
  "prac-entidades-contactos": "Entidades-contactos",
  "prac-estadisticos-general": "Estadísticos general-prácticas",
  "prac-legalizacion-reporte-general": "Módulo legalización – Reporte general",
  "prac-legalizacion-eval-seguimiento": "Módulo legalización – Evaluaciones de seguimiento",
  "prac-cierre-oportunidades": "Cierre de oportunidades",
  "prac-postulantes": "Postulantes",
  "prac-acuerdos-vinculacion": "Acuerdos de vinculación",
};

function titleForReport(reportId) {
  return REPORT_TITLES[reportId] || reportId.replace(/^mon-/, "Monitorías — ").replace(/^prac-/, "Prácticas — ").replace(/-/g, " ");
}

/**
 * @param {string} reportId
 * @param {Record<string, unknown>} rawFilters
 * @param {import("express").Request|null} [req]
 * @param {{ exportAll?: boolean, page?: number, pageSize?: number }} [listOpts] — `exportAll`: todas las filas (p. ej. Excel). Si no, `page`/`pageSize` paginan en servidor.
 * @returns {Promise<{ ok: boolean, status?: number, body: object }>}
 */
export async function generateReportPayload(reportId, rawFilters = {}, req = null, listOpts = {}) {
  const def = REPORT_FILTER_DEFINITIONS[reportId];
  if (!def) {
    return { ok: false, status: 404, body: { message: "Reporte no registrado", reportId } };
  }
  if (def.functionalDefinitionPending) {
    return {
      ok: false,
      status: 422,
      body: {
        message: "Este informe está pendiente de definición funcional.",
        pendingReason: def.pendingReason || null,
        reportId,
      },
    };
  }

  const filters = rawFilters && typeof rawFilters === "object" && !Array.isArray(rawFilters) ? rawFilters : {};
  const [filterLines, execResult] = await Promise.all([
    buildAppliedFilterLines(reportId, filters),
    executeReportData(reportId, filters, req, listOpts),
  ]);

  const columns = execResult.columns ?? [];
  const rows = execResult.rows ?? [];
  const total = typeof execResult.total === "number" ? execResult.total : rows.length;

  const body = {
    reportId,
    title: titleForReport(reportId),
    generatedAt: new Date().toISOString(),
    filterLines,
    columns,
    rows,
    total,
  };

  const exportAll = listOpts?.exportAll === true;
  const page = listOpts?.page;
  const pageSize = listOpts?.pageSize;
  if (!exportAll && page != null && pageSize != null) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    body.pagination = { page, pageSize, total, totalPages };
  }

  return {
    ok: true,
    status: 200,
    body,
  };
}
