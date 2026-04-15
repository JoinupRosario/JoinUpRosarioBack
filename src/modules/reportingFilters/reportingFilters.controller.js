import {
  buildFilterConfigPayload,
  listProgramsForReportFilters,
  searchPostulantsForReports,
  getEnumPayload,
} from "./reportingFilters.service.js";
import { generateReportPayload } from "./reportGenerate.service.js";

export async function postReportGenerate(req, res) {
  try {
    const { reportId } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const exportAll = body.exportAll === true || body.exportAll === "true";
    const pageRaw = body.page != null ? parseInt(String(body.page), 10) : NaN;
    const pageSizeRaw = body.pageSize != null ? parseInt(String(body.pageSize), 10) : NaN;
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : undefined;
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : undefined;
    const listOpts = { exportAll, page, pageSize };
    const result = await generateReportPayload(reportId, filters, req, listOpts);
    if (!result.ok) {
      return res.status(result.status || 500).json(result.body);
    }
    res.json(result.body);
  } catch (e) {
    res.status(500).json({ message: e.message || "Error al generar el reporte" });
  }
}

export async function getReportFilterConfig(req, res) {
  try {
    const { reportId } = req.params;
    const result = buildFilterConfigPayload(reportId);
    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
}

export async function getProgramsForReportFilters(req, res) {
  try {
    const rows = await listProgramsForReportFilters(req);
    const data = rows.map((r) => ({
      value: String(r._id),
      label: [r.code, r.name].filter(Boolean).join(" — ") || r.name,
      code: r.code || null,
      name: r.name,
    }));
    res.json({ data });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
}

export async function searchPostulantsForReportFilters(req, res) {
  try {
    const out = await searchPostulantsForReports(req);
    res.json(out);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
}

export async function getReportingEnum(req, res) {
  try {
    const { enumKey } = req.params;
    const result = getEnumPayload(enumKey);
    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
}
