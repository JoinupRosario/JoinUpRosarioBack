import mongoose from "mongoose";
import UserAdministrativo from "../modules/usersAdministrativos/userAdministrativo.model.js";
import Program from "../modules/program/model/program.model.js";

/**
 * Alcance de programas para usuarios con modulo `administrativo`.
 * Usado en listados de prácticas (opportunities) y monitorías MTM.
 */
export async function getAdminProgramScope(req) {
  const userModulo = String(req.user?.modulo || "").trim().toLowerCase();
  if (userModulo !== "administrativo") return null;

  const adminUser = await UserAdministrativo.findOne({ user: req.user?.id, estado: true })
    .select("programas")
    .lean();
  const programIds = (adminUser?.programas || [])
    .filter((p) => p?.estado !== false && p?.program)
    .map((p) => String(p.program));
  if (programIds.length === 0) return { programIds: [], programTerms: [] };

  const programs = await Program.find({ _id: { $in: programIds } }).select("name code").lean();
  const programTerms = [
    ...new Set(
      programs
        .flatMap((p) => [String(p?.name || "").trim(), String(p?.code || "").trim()])
        .filter(Boolean)
    ),
  ];
  return { programIds, programTerms };
}

/**
 * Oportunidad MTM (lean): ¿intersecta `programas` con los programas asignados al admin?
 */
export function mtmOportunidadMatchesAdminProgram(op, programIds) {
  if (!programIds?.length) return false;
  const allowed = new Set(programIds.map(String));
  const raw = op?.programas || [];
  for (const p of raw) {
    const id = p && typeof p === "object" && p._id != null ? String(p._id) : String(p);
    if (mongoose.Types.ObjectId.isValid(id) && allowed.has(id)) return true;
  }
  return false;
}

/**
 * Oferta MTM sin refs en `programas`: intentar alinear con programas asignados al admin
 * por texto en unidad académica, nombre del cargo o nombres/códigos de programas (populate).
 */
export function mtmOpportunityMatchesAdminProgramTerms(op, programTerms) {
  if (!programTerms?.length) return false;
  const terms = programTerms.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  if (!terms.length) return false;
  const hay = [];
  const ua = String(op?.unidadAcademica || "").trim().toLowerCase();
  if (ua) hay.push(ua);
  const nc = String(op?.nombreCargo || "").trim().toLowerCase();
  if (nc) hay.push(nc);
  for (const p of op?.programas || []) {
    if (p && typeof p === "object") {
      hay.push(String(p.name || "").trim().toLowerCase());
      hay.push(String(p.code || "").trim().toLowerCase());
    }
  }
  return terms.some((t) => hay.some((h) => h && (h.includes(t) || t.includes(h))));
}
