/**
 * Convierte un documento de análisis estructurado (derivado de `reporte_parametros.md`)
 * en `ReportDefinition`. No interpreta SQL ni valores de negocio: solo forma y metadata.
 *
 * @param {import("../schemas/analysisSource.schema.js").ReportAnalysisSourceV1} source
 * @returns {import("../../domain/reportDefinition.js").ReportDefinition}
 */
export function mapAnalysisSourceToReportDefinition(source) {
  const filters = (source.suggestedParameters || []).map((p) => {
    const base = {
      name: p.filterId,
      fieldHints: p.semanticFields?.map((f) => ({ table: f.table, column: f.column })) || []
    };

    if (p.presentation === "date_range") {
      return { ...base, type: /** @type {const} */ ("date") };
    }

    if (p.presentation === "select_catalog") {
      const routeType = p.catalog?.routeType;
      if (!routeType) {
        throw new Error(`select_catalog sin catalog.routeType (${p.filterId})`);
      }
      return {
        ...base,
        type: /** @type {const} */ ("select"),
        dataSource: /** @type {const} */ ("api"),
        sourceConfig: { endpoint: `/catalogs/${encodeURIComponent(routeType)}` }
      };
    }

    if (p.presentation === "select_remote") {
      const endpoint = p.remote?.endpoint;
      if (!endpoint) {
        throw new Error(`select_remote sin remote.endpoint (${p.filterId})`);
      }
      return {
        ...base,
        type: /** @type {const} */ ("select"),
        dataSource: /** @type {const} */ ("api"),
        sourceConfig: { endpoint }
      };
    }

    if (p.presentation === "text") {
      return { ...base, type: /** @type {const} */ ("text") };
    }

    if (p.presentation === "number") {
      return { ...base, type: /** @type {const} */ ("number") };
    }

    throw new Error(`presentation no soportada: ${/** @type {any} */ (p).presentation}`);
  });

  const relations = (source.relationshipNotes || []).map((description) => ({ description }));

  return {
    name: source.reportKey,
    category: source.category,
    filters,
    relations
  };
}
