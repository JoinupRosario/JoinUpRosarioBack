/**
 * Solicitud de generación de reporte (capa aplicación).
 * @typedef {object} ReportRequestDto
 * @property {string} [format]
 * @property {Record<string, unknown>} filters
 */

/**
 * @param {unknown} body
 * @returns {ReportRequestDto}
 */
export function parseReportRequestDto(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de solicitud inválido");
  }
  const b = /** @type {any} */ (body);
  const filters = b.filters && typeof b.filters === "object" ? b.filters : {};
  return {
    format: typeof b.format === "string" ? b.format : "json",
    filters
  };
}
