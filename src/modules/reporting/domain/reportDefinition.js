/**
 * @typedef {"monitorias"|"practicas"} ReportCategory
 */

/**
 * @typedef {"date"|"select"|"text"|"number"} ReportFilterType
 */

/**
 * @typedef {"api"|"static"|undefined} ReportFilterDataSource
 */

/**
 * Modelo genérico de definición de reporte (contrato de dominio / aplicación).
 * @typedef {object} ReportDefinition
 * @property {string} name
 * @property {ReportCategory} category
 * @property {ReportFilter[]} filters
 * @property {ReportRelationMeta[]} [relations]
 */

/**
 * @typedef {object} ReportFilter
 * @property {string} name
 * @property {ReportFilterType} type
 * @property {ReportFilterDataSource} [dataSource]
 * @property {ReportSourceConfig|undefined} [sourceConfig]
 * @property {ReportFieldRef[]} [fieldHints]
 */

/**
 * @typedef {object} ReportSourceConfig
 * @property {string} [endpoint]
 * @property {string} [table]
 * @property {string} [relation]
 */

/**
 * Referencia declarativa a campo (metadata del análisis, no SQL ejecutable).
 * @typedef {object} ReportFieldRef
 * @property {string} table
 * @property {string} column
 */

/**
 * @typedef {object} ReportRelationMeta
 * @property {string} description
 */

export {};
