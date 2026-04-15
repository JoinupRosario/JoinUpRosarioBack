/**
 * Puerto de persistencia para datos de reportes (implementación en infraestructura).
 * @typedef {object} ReportRepositoryPort
 * @property {(reportName: string, filters: Record<string, unknown>) => Promise<{ rows: object[], meta?: object }>} fetchReportData
 */

/**
 * Clase base documental: las implementaciones concretas viven en infrastructure.
 */
export class ReportRepositoryPort {
  /**
   * @param {string} reportName
   * @param {Record<string, unknown>} filters
   * @returns {Promise<{ rows: object[], meta?: object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async fetchReportData(reportName, filters) {
    throw new Error("ReportRepositoryPort.fetchReportData no implementado");
  }
}
