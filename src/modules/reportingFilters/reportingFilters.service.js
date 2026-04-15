import mongoose from "mongoose";
import { buildAccentInsensitiveMongoRegexPattern } from "../companies/companySearch.helper.js";
import Postulant from "../postulants/models/postulants.schema.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram } from "../postulants/models/profile/index.js";
import Program from "../program/model/program.model.js";
import User from "../users/user.model.js";
import UserAdministrativo from "../usersAdministrativos/userAdministrativo.model.js";
import EstudianteHabilitado from "../estudiantesHabilitados/estudianteHabilitado.model.js";
import { REPORT_FILTER_DEFINITIONS } from "./reportFilterDefinitions.js";
import { listEnumOptions } from "./reportingEnums.registry.js";
import { getAdminProgramScope } from "../../utils/adminProgramScope.util.js";

/**
 * Expone la definición declarativa (alineada a Criterios.docx vía reportFilterDefinitions).
 */
export function getDefinitionForReport(reportId) {
  const def = REPORT_FILTER_DEFINITIONS[reportId];
  if (!def) return null;
  return def;
}

function serializeField(field) {
  const base = {
    kind: field.kind,
    key: field.key,
    label: field.label,
    hint: field.hint,
    dependsOn: field.dependsOn,
    functionalDefinitionPending: field.functionalDefinitionPending,
    pendingReason: field.pendingReason,
  };
  if (field.kind === "date_range") {
    return {
      ...base,
      startKey: field.startKey,
      endKey: field.endKey,
      loadStrategy: "date_range",
    };
  }
  if (field.kind === "switch") {
    return { ...base, loadStrategy: "boolean" };
  }
  if (field.kind === "text") {
    return { ...base, loadStrategy: "text" };
  }
  if (field.kind === "numeric_range_with_unit") {
    return {
      ...base,
      loadStrategy: "numeric_range_with_unit",
      minKey: field.minKey,
      maxKey: field.maxKey,
      unitKey: field.unitKey,
      unitChoices:
        Array.isArray(field.unitChoices) && field.unitChoices.length > 0
          ? field.unitChoices
          : [
              { value: "anios", label: "Años" },
              { value: "meses", label: "Meses" },
            ],
    };
  }
  if (field.kind === "decimal_range_row") {
    return {
      ...base,
      loadStrategy: "decimal_range_row",
      minKey: field.minKey,
      maxKey: field.maxKey,
      localeTag: field.localeTag || "es-CO",
      fractionDigits: field.fractionDigits ?? 2,
    };
  }
  if (field.kind === "select") {
    if (field.enumKey) {
      return {
        ...base,
        loadStrategy: "enum",
        optionsPath: `/reporting-filters/enums/${encodeURIComponent(field.enumKey)}`,
        enumKey: field.enumKey,
      };
    }
    if (field.catalogType) {
      return {
        ...base,
        loadStrategy: "catalog",
        optionsPath: `/catalogs/${encodeURIComponent(field.catalogType)}`,
        catalogType: field.catalogType,
      };
    }
    const q = field.endpointQuery && typeof field.endpointQuery === "object" ? field.endpointQuery : {};
    const queryString = new URLSearchParams(
      Object.entries(q).reduce((acc, [k, v]) => {
        if (v !== undefined && v !== null) acc[k] = String(v);
        return acc;
      }, {})
    ).toString();
    const path = `${field.optionEndpoint}${queryString ? `?${queryString}` : ""}`;
    return {
      ...base,
      loadStrategy: "remote",
      optionsPath: path,
      valueField: field.valueField || "_id",
      labelField: field.labelField || "name",
      searchable: !!field.searchable,
    };
  }
  if (field.kind === "select_program") {
    return {
      ...base,
      loadStrategy: "programs",
      optionsPath: "/reporting-filters/programs",
      searchable: !!field.searchable,
    };
  }
  if (field.kind === "autocomplete_postulant") {
    return {
      ...base,
      loadStrategy: "postulant_search",
      searchPath: "/reporting-filters/postulants/search",
    };
  }
  return { ...base, loadStrategy: "unknown" };
}

export function buildFilterConfigPayload(reportId) {
  const def = getDefinitionForReport(reportId);
  if (!def) {
    return { ok: false, status: 404, body: { message: "Reporte sin definición de filtros", reportId } };
  }
  const fields = (def.fields || []).map(serializeField);
  return {
    ok: true,
    body: {
      reportId,
      functionalDefinitionPending: !!def.functionalDefinitionPending,
      pendingReason: def.pendingReason || null,
      reportHint: typeof def.reportHint === "string" && def.reportHint.trim() ? def.reportHint.trim() : null,
      fields,
    },
  };
}

/**
 * Programas para filtros de reportes:
 * - Con estudiante: solo programas en curso o cursados (enrolled + graduate con programId).
 * - Usuario administrativo: intersección con programas asignados (si aplica).
 * - Sin estudiante y no admin: lista amplia (catálogo de programas).
 */
export async function listProgramsForReportFilters(req) {
  const postulantIdRaw = req.query.postulantId != null ? String(req.query.postulantId).trim() : "";
  const searchRaw = req.query.search != null ? String(req.query.search).trim() : "";
  const adminScope = await getAdminProgramScope(req);
  const isAdmin = adminScope !== null;

  const searchRegex =
    searchRaw.length > 0 ? buildAccentInsensitiveMongoRegexPattern(searchRaw) : null;
  const searchFilter =
    searchRegex != null
      ? {
          $or: [{ name: { $regex: searchRegex, $options: "i" } }, { code: { $regex: searchRegex, $options: "i" } }],
        }
      : {};

  let studentProgramIds = null;
  if (postulantIdRaw) {
    if (!mongoose.Types.ObjectId.isValid(postulantIdRaw)) {
      return [];
    }
    const postulantExists = await Postulant.exists({ _id: postulantIdRaw });
    if (!postulantExists) {
      return [];
    }
    const profiles = await PostulantProfile.find({ postulantId: postulantIdRaw }).select("_id").lean();
    const profileIds = profiles.map((p) => p._id);
    if (profileIds.length === 0) {
      return [];
    }
    const [enrolledIds, graduateIds] = await Promise.all([
      ProfileEnrolledProgram.distinct("programId", { profileId: { $in: profileIds } }),
      ProfileGraduateProgram.distinct("programId", {
        profileId: { $in: profileIds },
        programId: { $exists: true, $ne: null },
      }),
    ]);
    const merged = [...new Set([...enrolledIds, ...graduateIds].map(String))].filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    studentProgramIds = merged;
    if (studentProgramIds.length === 0) {
      return [];
    }
  }

  if (isAdmin) {
    const adminIds = adminScope.programIds;
    if (!adminIds.length) {
      return [];
    }
    const filterIds =
      studentProgramIds != null
        ? studentProgramIds.filter((id) => adminIds.map(String).includes(String(id)))
        : adminIds.map(String);
    if (!filterIds.length) {
      return [];
    }
    return Program.find({ _id: { $in: filterIds }, ...searchFilter })
      .select("_id name code")
      .sort({ name: 1 })
      .limit(500)
      .lean();
  }

  if (studentProgramIds != null) {
    return Program.find({ _id: { $in: studentProgramIds }, ...searchFilter })
      .select("_id name code")
      .sort({ name: 1 })
      .limit(500)
      .lean();
  }

  return Program.find(searchFilter)
    .select("_id name code")
    .sort({ name: 1 })
    .limit(500)
    .lean();
}

async function postulantIdsVisibleToRequester(req) {
  const userModulo = String(req.user?.modulo || "").trim().toLowerCase();
  const isAdministrativeUser = userModulo === "administrativo";

  if (!isAdministrativeUser) {
    return null;
  }

  const adminUser = await UserAdministrativo.findOne({ user: req.user?.id, estado: true }).select("programas").lean();
  if (!adminUser) {
    return [];
  }
  const associatedProgramIds = (adminUser?.programas || [])
    .filter((p) => p?.estado !== false && p?.program)
    .map((p) => String(p.program));
  if (associatedProgramIds.length === 0) {
    return [];
  }

  const [enrolledProfileIds, graduateProfileIds] = await Promise.all([
    ProfileEnrolledProgram.distinct("profileId", { programId: { $in: associatedProgramIds } }),
    ProfileGraduateProgram.distinct("profileId", { programId: { $in: associatedProgramIds } }),
  ]);
  const profileIds = [...new Set([...enrolledProfileIds, ...graduateProfileIds])];
  if (!profileIds.length) {
    return [];
  }
  return PostulantProfile.distinct("postulantId", { _id: { $in: profileIds } });
}

/** Código estudiantil: mismo criterio que listado de postulantes (perfil más reciente con `studentCode`). */
async function studentCodeByPostulantIds(postulantIds) {
  if (!postulantIds?.length) return new Map();
  const rows = await PostulantProfile.aggregate([
    { $match: { postulantId: { $in: postulantIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$postulantId", studentCode: { $first: "$studentCode" } } },
  ]);
  return new Map(
    rows.map((s) => {
      const sc =
        s.studentCode != null && String(s.studentCode).trim() !== "" ? String(s.studentCode).trim() : "";
      return [String(s._id), sc];
    })
  );
}

function buildPostulantReportLabel({ studentCode, identificacion, nombre }) {
  const parts = [];
  if (studentCode) parts.push(studentCode);
  if (identificacion && identificacion !== studentCode) parts.push(identificacion);
  if (nombre) parts.push(nombre);
  const joined = parts.join(" | ");
  return joined || nombre || studentCode || identificacion || "Estudiante";
}

async function mapPostulantsToReportFilterData(postulants) {
  if (!postulants?.length) return [];
  const ids = postulants.map((p) => p._id);
  const [identRows, studentCodeMap] = await Promise.all([
    EstudianteHabilitado.find({ postulant: { $in: ids } })
      .select("postulant identificacion")
      .lean(),
    studentCodeByPostulantIds(ids),
  ]);
  const identByPostulant = new Map(identRows.map((r) => [String(r.postulant), String(r.identificacion || "").trim()]));

  return postulants.map((p) => {
    const u = p.postulantId;
    const userCode = u?.code != null && String(u.code).trim() !== "" ? String(u.code).trim() : "";
    const identEh = identByPostulant.get(String(p._id)) || "";
    const identificacion = identEh || userCode;
    const studentCode = studentCodeMap.get(String(p._id)) || "";
    const name = u?.name != null ? String(u.name).trim() : "";
    const label = buildPostulantReportLabel({ studentCode, identificacion, nombre: name });
    return {
      value: String(p._id),
      label,
      userCode: userCode || null,
      studentCode: studentCode || null,
      identificacion: identificacion || null,
      nombre: name || null,
    };
  });
}

/**
 * Búsqueda de estudiantes para reportes (AMRE/GPAG).
 * Misma regla de alcance por programas que listado de postulantes para administrativos.
 * Con `q` vacío devuelve un subconjunto reciente para desplegar la lista sin escribir aún.
 */
export async function searchPostulantsForReports(req) {
  const q = String(req.query.q ?? req.query.search ?? "").trim();
  const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 15));

  const allowedPostulantIds = await postulantIdsVisibleToRequester(req);
  const postulantFilter = {};
  if (allowedPostulantIds !== null) {
    if (allowedPostulantIds.length === 0) {
      return { data: [] };
    }
    postulantFilter._id = { $in: allowedPostulantIds };
  }

  if (!q) {
    const postulants = await Postulant.find(postulantFilter)
      .populate("postulantId", "_id name email code estado")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    const data = await mapPostulantsToReportFilterData(postulants);
    return { data };
  }

  const term = q;
  const regexOpt = { $regex: term, $options: "i" };
  const userSearchFilter = { $or: [{ name: regexOpt }, { email: regexOpt }, { code: regexOpt }] };
  const [users, profilesWithStudentCode, ehByIdent] = await Promise.all([
    User.find(userSearchFilter).select("_id").lean(),
    PostulantProfile.find({ studentCode: regexOpt }).select("postulantId").lean(),
    EstudianteHabilitado.find({ identificacion: regexOpt }).select("postulant").lean(),
  ]);
  const userIds = users.map((u) => u._id);
  const fromProfiles = profilesWithStudentCode.map((p) => p.postulantId).filter(Boolean);
  const fromEhIdent = ehByIdent.map((r) => r.postulant).filter(Boolean);
  const orClause = [];
  if (userIds.length) orClause.push({ postulantId: { $in: userIds } });
  if (fromProfiles.length) orClause.push({ _id: { $in: fromProfiles } });
  if (fromEhIdent.length) orClause.push({ _id: { $in: fromEhIdent } });
  if (orClause.length) postulantFilter.$or = orClause;
  else return { data: [] };

  const postulants = await Postulant.find(postulantFilter)
    .populate("postulantId", "_id name email code estado")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const data = await mapPostulantsToReportFilterData(postulants);
  return { data };
}

export function getEnumPayload(enumKey) {
  const opts = listEnumOptions(enumKey);
  if (!opts) {
    return { ok: false, status: 404, body: { message: "Enum de filtro no registrado", enumKey } };
  }
  return { ok: true, body: { data: opts } };
}
