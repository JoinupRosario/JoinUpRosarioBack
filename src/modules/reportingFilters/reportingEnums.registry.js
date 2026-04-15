/**
 * Opciones de filtros alineadas al dominio Mongo (no catálogo `item`).
 * Etiquetas en español para UI.
 */
import { COMPANY_ENTITY_STATUSES } from "../companies/company.model.js";
import { OPPORTUNITY_PRACTICE_ESTADOS } from "../opportunities/opportunity.model.js";

const labelize = (s) =>
  String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const ENTIDAD_STATUS_LABEL = {
  active: "Activa",
  inactive: "Inactiva",
  pending_approval: "Pendiente de aprobación",
};

export const REPORTING_ENUM_REGISTRY = {
  oportunidad_mtm_estado: ["Creada", "Activa", "Inactiva"].map((v) => ({ value: v, label: v })),
  legalizacion_mtm_estado: [
    "creada",
    "en_revision",
    "aprobada",
    "finalizada",
    "rechazada",
    "en_ajuste",
  ].map((v) => ({ value: v, label: labelize(v) })),
  postulacion_mtm_estado: [
    "aplicado",
    "empresa_consulto_perfil",
    "empresa_descargo_hv",
    "seleccionado_empresa",
    "aceptado_estudiante",
    "rechazado",
  ].map((v) => ({ value: v, label: labelize(v) })),
  plan_trabajo_mtm_estado: ["borrador", "enviado_revision", "aprobado", "rechazado"].map((v) => ({
    value: v,
    label: labelize(v),
  })),
  seguimiento_actividad_mtm_estado: ["pendiente_revision", "aprobado", "rechazado"].map((v) => ({
    value: v,
    label: labelize(v),
  })),
  /** Mismo conjunto que `Opportunity.estado` en Mongo (práctica). */
  oportunidad_practica_estado: OPPORTUNITY_PRACTICE_ESTADOS.map((v) => ({ value: v, label: v })),
  /** Mismo conjunto que `Company.status` (entidad). */
  entidad_status: COMPANY_ENTITY_STATUSES.map((v) => ({
    value: v,
    label: ENTIDAD_STATUS_LABEL[v] ?? labelize(v),
  })),
};

export function listEnumOptions(enumKey) {
  return REPORTING_ENUM_REGISTRY[enumKey] || null;
}
