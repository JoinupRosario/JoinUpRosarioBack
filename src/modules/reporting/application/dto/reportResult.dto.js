/**
 * @typedef {object} ReportResultDto
 * @property {string} reportName
 * @property {string} format
 * @property {object[]} rows
 * @property {object} [meta]
 */

/**
 * @param {string} reportName
 * @param {string} format
 * @param {object[]} rows
 * @param {object} [meta]
 * @returns {ReportResultDto}
 */
export function buildReportResultDto(reportName, format, rows, meta) {
  return { reportName, format, rows, ...(meta ? { meta } : {}) };
}
