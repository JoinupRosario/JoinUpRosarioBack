/**
 * Vista de filtro expuesta al cliente (puede enriquecerse sin tocar dominio).
 * @typedef {object} ReportFilterDto
 * @property {string} name
 * @property {import("../../domain/reportDefinition.js").ReportFilterType} type
 * @property {import("../../domain/reportDefinition.js").ReportFilterDataSource} [dataSource]
 * @property {import("../../domain/reportDefinition.js").ReportSourceConfig} [sourceConfig]
 * @property {import("../../domain/reportDefinition.js").ReportFieldRef[]} [fieldHints]
 */

export {};
