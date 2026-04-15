import mongoose from "mongoose";
import {
  getAdminProgramScope,
  mtmOportunidadMatchesAdminProgram,
  mtmOpportunityMatchesAdminProgramTerms,
} from "../../utils/adminProgramScope.util.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram } from "../postulants/models/profile/index.js";
import Program from "../program/model/program.model.js";

/**
 * `null` = usuario no es administrativo (sin restricción por asignación de programas).
 * `[]` = administrativo sin programas asignados (sin datos permitidos).
 * `[ids]` = programas Mongo asignados al usuario administrativo.
 */
export async function getAdminProgramIdsForReports(req) {
  if (!req?.user?.id) return null;
  const scope = await getAdminProgramScope(req);
  if (scope === null) return null;
  return (scope.programIds || []).map(String);
}

/**
 * Postulantes que tienen al menos un perfil con programa en curso o finalizado
 * dentro de los programas asignados al administrativo.
 * @returns {Promise<string[]|null>} lista de ObjectId string; `null` si no aplica restricción
 */
export async function getPostulantIdsInAdminProgramScope(req) {
  const programIds = await getAdminProgramIdsForReports(req);
  if (programIds === null) return null;
  if (programIds.length === 0) return [];
  const oids = programIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  const [enrolledProfileIds, graduateProfileIds] = await Promise.all([
    ProfileEnrolledProgram.distinct("profileId", { programId: { $in: oids } }),
    ProfileGraduateProgram.distinct("profileId", { programId: { $in: oids } }),
  ]);
  const profileIds = [...new Set([...enrolledProfileIds, ...graduateProfileIds].map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (profileIds.length === 0) return [];
  return PostulantProfile.distinct("postulantId", { _id: { $in: profileIds } });
}

/**
 * @param {unknown} opDoc oportunidad MTM (lean), idealmente con `programas` poblados (name/code)
 * @param {string[]|null|undefined} adminProgramIds ids asignados al administrativo
 * @param {string[]|null|undefined} [programTerms] nombres/códigos de esos programas (desde getAdminProgramScope)
 */
export function mtmOpportunityAllowedForAdmin(opDoc, adminProgramIds, programTerms) {
  if (!adminProgramIds?.length) return true;
  if (mtmOportunidadMatchesAdminProgram(opDoc, adminProgramIds)) return true;
  return mtmOpportunityMatchesAdminProgramTerms(opDoc, programTerms);
}

/**
 * Si el usuario es administrativo, el programa elegido debe estar en su asignación.
 * @returns {import("mongoose").Types.ObjectId|null}
 */
export function coerceProgramIdForAdminFilter(programIdRaw, adminProgramIds) {
  if (programIdRaw == null || String(programIdRaw).trim() === "") return null;
  const s = String(programIdRaw).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  if (adminProgramIds === null) return new mongoose.Types.ObjectId(s);
  if (!adminProgramIds.length) return null;
  if (!adminProgramIds.map(String).includes(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/** Oportunidad práctica: ¿coincide formación académica con alguno de los programas permitidos? */
export async function practiceOpportunityMatchesAdminPrograms(opp, adminProgramIds) {
  if (!adminProgramIds?.length) return true;
  const oids = adminProgramIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  const programs = await Program.find({ _id: { $in: oids } }).select("name code").lean();
  const terms = [...new Set(programs.flatMap((p) => [String(p.name || "").trim(), String(p.code || "").trim()].filter(Boolean)))];
  if (!terms.length) return false;
  const fa = Array.isArray(opp.formacionAcademica) ? opp.formacionAcademica : [];
  return fa.some((row) => {
    const prog = String(row?.program || "").trim().toLowerCase();
    if (!prog) return false;
    return terms.some((t) => prog.includes(t.toLowerCase()));
  });
}
