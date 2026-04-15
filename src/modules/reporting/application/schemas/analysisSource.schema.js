/**
 * Esquema V1 del JSON de análisis (contenido declarativo, editable sin tocar código).
 * @typedef {object} ReportAnalysisSourceV1
 * @property {1} version
 * @property {string} fromDocument
 * @property {string} reportKey
 * @property {"monitorias"|"practicas"} category
 * @property {string[]} probableTables
 * @property {ReportAnalysisParameter[]} suggestedParameters
 * @property {string[]} [relationshipNotes]
 */

/**
 * @typedef {object} ReportAnalysisParameter
 * @property {string} filterId
 * @property {string} docLabel
 * @property {"date_range"|"select_catalog"|"select_remote"|"text"|"number"} presentation
 * @property {ReportSemanticField[]} [semanticFields]
 * @property {ReportCatalogHint} [catalog]
 * @property {ReportRemoteHint} [remote]
 */

/**
 * @typedef {object} ReportSemanticField
 * @property {string} table
 * @property {string} column
 */

/**
 * @typedef {object} ReportCatalogHint
 * @property {"item_catalog"} strategy
 * @property {string} routeType parámetro de URL para `/catalogs/:type` (p. ej. listId o slug acordado)
 */

/**
 * @typedef {object} ReportRemoteHint
 * @property {string} endpoint ruta API relativa (p. ej. `/programs`)
 */

export {};
