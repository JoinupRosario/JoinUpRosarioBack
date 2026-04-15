import mongoose from "mongoose";
import { REPORT_FILTER_DEFINITIONS } from "./reportFilterDefinitions.js";
import { listEnumOptions } from "./reportingEnums.registry.js";
import Periodo from "../periodos/periodo.model.js";
import Program from "../program/model/program.model.js";
import Item from "../shared/reference-data/models/item.schema.js";
import Postulant from "../postulants/models/postulants.schema.js";
import Company from "../companies/company.model.js";
import Faculty from "../faculty/model/faculty.model.js";
import Asignatura from "../asignaturas/asignatura.model.js";

function formatDateInput(v) {
  if (v == null || String(v).trim() === "") return "";
  const d = new Date(String(v).trim().length <= 10 ? `${String(v).trim()}T12:00:00` : String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("es-CO");
}

function truthySwitch(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

async function resolveEnumLabel(enumKey, value) {
  if (value == null || String(value).trim() === "") return "";
  const opts = listEnumOptions(enumKey);
  if (!opts) return String(value);
  const hit = opts.find((o) => String(o.value) === String(value));
  return hit?.label || String(value);
}

async function resolveCatalogItemLabel(itemId) {
  if (!mongoose.Types.ObjectId.isValid(itemId)) return String(itemId);
  const it = await Item.findById(itemId).select("value description").lean();
  if (!it) return String(itemId);
  return String(it.value ?? "").trim() || String(it.description ?? "").trim() || String(itemId);
}

async function resolvePeriodLabel(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return String(id);
  const p = await Periodo.findById(id).select("codigo").lean();
  return p?.codigo != null ? String(p.codigo) : String(id);
}

async function resolveProgramLabel(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return String(id);
  const p = await Program.findById(id).select("name code").lean();
  if (!p) return String(id);
  return [p.code, p.name].filter(Boolean).join(" — ") || String(id);
}

async function resolveCompanyLabel(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return String(id);
  const c = await Company.findById(id).select("name commercialName").lean();
  if (!c) return String(id);
  return (c.commercialName || c.name || "").trim() || String(id);
}

async function resolveFacultyLabel(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return String(id);
  const f = await Faculty.findById(id).select("name").lean();
  return f?.name || String(id);
}

async function resolveAsignaturaLabel(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return String(id);
  const a = await Asignatura.findById(id).select("nombreAsignatura codigo").lean();
  if (!a) return String(id);
  return [a.codAsignatura, a.nombreAsignatura].filter(Boolean).join(" — ") || String(id);
}

async function resolvePostulantSearchLabel(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return String(id);
  const p = await Postulant.findById(id).populate("postulantId", "name code email").lean();
  if (!p?.postulantId) return String(id);
  const u = p.postulantId;
  const name = u.name != null ? String(u.name).trim() : "";
  const code = u.code != null ? String(u.code).trim() : "";
  return [name, code && `Usuario: ${code}`].filter(Boolean).join(" · ") || String(id);
}

async function resolveRemoteSelect(field, value) {
  if (value == null || String(value).trim() === "") return "";
  const ep = String(field.optionEndpoint || "");
  if (ep.includes("/periodos")) return resolvePeriodLabel(value);
  if (ep.includes("/companies")) return resolveCompanyLabel(value);
  if (ep.includes("/faculties")) return resolveFacultyLabel(value);
  if (ep.includes("/asignaturas")) return resolveAsignaturaLabel(value);
  return String(value);
}

/**
 * Líneas de texto para encabezado de reporte / Excel (filtros aplicados).
 * @param {string} reportId
 * @param {Record<string, unknown>} filters
 * @returns {Promise<string[]>}
 */
export async function buildAppliedFilterLines(reportId, filters) {
  const def = REPORT_FILTER_DEFINITIONS[reportId];
  if (!def?.fields?.length) {
    return [];
  }

  const f = filters && typeof filters === "object" ? filters : {};
  const lines = [];

  for (const field of def.fields) {
    if (field.kind === "date_range") {
      const a = f[field.startKey];
      const b = f[field.endKey];
      if ((a != null && String(a).trim() !== "") || (b != null && String(b).trim() !== "")) {
        const left = a != null && String(a).trim() !== "" ? formatDateInput(a) : "…";
        const right = b != null && String(b).trim() !== "" ? formatDateInput(b) : "…";
        lines.push(`${field.label}: ${left} a ${right}`);
      }
      continue;
    }

    if (field.kind === "numeric_range_with_unit") {
      const u = f[field.unitKey];
      const min = f[field.minKey];
      const max = f[field.maxKey];
      if (
        (min != null && String(min).trim() !== "") ||
        (max != null && String(max).trim() !== "") ||
        (u != null && String(u).trim() !== "")
      ) {
        const unit = u === "meses" ? "meses" : "años";
        lines.push(
          `${field.label}: ${min != null && String(min).trim() !== "" ? String(min) : "…"} a ${
            max != null && String(max).trim() !== "" ? String(max) : "…"
          } (${unit})`
        );
      }
      continue;
    }

    if (field.kind === "decimal_range_row") {
      const min = f[field.minKey];
      const max = f[field.maxKey];
      if ((min != null && String(min).trim() !== "") || (max != null && String(max).trim() !== "")) {
        lines.push(
          `${field.label}: ${min != null && String(min).trim() !== "" ? String(min) : "…"} a ${
            max != null && String(max).trim() !== "" ? String(max) : "…"
          }`
        );
      }
      continue;
    }

    if (field.kind === "switch") {
      if (truthySwitch(f[field.key])) {
        lines.push(`${field.label}: Sí`);
      }
      continue;
    }

    if (field.kind === "text") {
      const v = f[field.key];
      if (v != null && String(v).trim() !== "") {
        lines.push(`${field.label}: ${String(v).trim()}`);
      }
      continue;
    }

    if (field.kind === "select") {
      const v = f[field.key];
      if (v == null || String(v).trim() === "") continue;
      if (field.enumKey) {
        const label = await resolveEnumLabel(field.enumKey, v);
        lines.push(`${field.label}: ${label}`);
        continue;
      }
      if (field.catalogType) {
        const label = await resolveCatalogItemLabel(v);
        lines.push(`${field.label}: ${label}`);
        continue;
      }
      if (field.optionEndpoint) {
        const label = await resolveRemoteSelect(field, v);
        lines.push(`${field.label}: ${label}`);
      }
      continue;
    }

    if (field.kind === "select_program") {
      const v = f[field.key];
      if (v == null || String(v).trim() === "") continue;
      const label = await resolveProgramLabel(v);
      lines.push(`${field.label}: ${label}`);
      continue;
    }

    if (field.kind === "autocomplete_postulant") {
      const v = f[field.key];
      if (v == null || String(v).trim() === "") continue;
      const label = await resolvePostulantSearchLabel(v);
      lines.push(`${field.label}: ${label}`);
    }
  }

  return lines;
}
