import mongoose from "mongoose";
import PostulacionMTM from "../../oportunidadesMTM/postulacionMTM.model.js";
import LegalizacionMTM from "../../oportunidadesMTM/legalizacionMTM.model.js";
import PlanDeTrabajoMTM from "../../oportunidadesMTM/planDeTrabajoMTM.model.js";
import Periodo from "../../periodos/periodo.model.js";
import { parseEnvEmailList } from "./resolveRecipientEmails.js";

export function mtmFrontendLink(path = "/dashboard/monitorias") {
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
  const cleanPath = String(path || "").startsWith("/") ? String(path) : `/${String(path || "")}`;
  return `${String(baseUrl).replace(/\/$/, "")}/#${cleanPath}`;
}

/**
 * Variables para plantillas MTM (catálogo: NOMBRE_MONITORIA, PERIODO, PROGRAMA, TIPO_MONITORIA, LINK, …).
 * - NOMBRE_* = nombre del cargo / oferta (OportunidadMTM.nombreCargo).
 * - TIPO_MONITORIA = ítem tipo vinculación / categoría; sin valor por defecto (vacío si no hay dato en BD).
 */
export function buildVariablesPlantillaMtmEstudianteOportunidad({
  nombreEstudiante,
  nombreCargo,
  periodoCodigo,
  linkAprobarPlan = "/dashboard/monitorias",
  tipoMonitoria = "",
  programa = "",
  funciones = "",
}) {
  const nombreOportunidad = String(nombreCargo || "").trim() || "Sin nombre registrado";
  const tipoLabel = String(tipoMonitoria || "").trim();
  const ne = (nombreEstudiante || "").trim() || "Estudiante";
  const link = mtmFrontendLink((linkAprobarPlan || "").trim() || "/dashboard/monitorias");
  return {
    NOMBRE_ESTUDIANTE: ne,
    PERIODO: periodoCodigo || "",
    PROGRAMA: programa || "",
    TIPO_MONITORIA: tipoLabel,
    FUNCIONES: String(funciones || "").trim(),
    NOMBRE_MTM: nombreOportunidad,
    NOMBRE_MONITORIA: nombreOportunidad,
    TITULO_MONITORIA: nombreOportunidad,
    NOMBRE_OPORTUNIDAD: nombreOportunidad,
    /** Alias útil en plantillas HU que hablan de "legalización" (no hay nombre propio en LegalizacionMTM). */
    NOMBRE_LEGALIZACION: nombreOportunidad,
    LINK_APROBAR_PLAN: link,
    LINK: link,
  };
}

export function buildVariablesPlantillaMtmPlanCargo({ nombreCargo, periodoCodigo }) {
  const nombre = String(nombreCargo || "").trim() || "Sin nombre registrado";
  return {
    PERIODO: periodoCodigo || "",
    NOMBRE_MTM: nombre,
    NOMBRE_MONITORIA: nombre,
    TITULO_MONITORIA: nombre,
    NOMBRE_OPORTUNIDAD: nombre,
  };
}

export function recipientContextCoordProf(profEmail) {
  const extraCoord = parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR);
  return {
    coordinador: [profEmail, ...extraCoord].filter(Boolean),
    docente: profEmail,
    administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
  };
}

function formatProgramaDoc(p) {
  if (!p || typeof p !== "object") return "";
  const name = String(p.name || "").trim();
  const level = String(p.level || "").trim();
  const label = String(p.labelLevel || "").trim();
  const code = String(p.code || "").trim();
  const primary = name || label || code;
  if (level && primary) return `${level} — ${primary}`;
  return primary || level;
}

/**
 * postulaciones_mtm → oportunidades_mtm (periodo, programas, tipo/categoría).
 */
export async function loadMtmPostulacionContext(postulacionId) {
  if (!postulacionId || !mongoose.Types.ObjectId.isValid(String(postulacionId))) return null;
  const po = await PostulacionMTM.findById(postulacionId)
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo profesorResponsable programas tipoVinculacion categoria funciones",
      populate: [
        { path: "periodo", select: "codigo" },
        { path: "profesorResponsable", select: "nombres apellidos", populate: { path: "user", select: "email" } },
        { path: "programas", select: "name code level labelLevel" },
        { path: "tipoVinculacion", select: "value description listId" },
        { path: "categoria", select: "value description listId" },
      ],
    })
    .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
    .lean();
  if (!po?.oportunidadMTM) return null;
  const opp = po.opportunidadMTM;
  const estudianteEmail = po.postulant?.postulantId?.email;
  const profEmail = opp?.profesorResponsable?.user?.email;
  const programas = Array.isArray(opp?.programas)
    ? opp.programas.map((p) => formatProgramaDoc(p)).filter(Boolean)
    : [];
  const tipoMonitoria = String(
    opp?.tipoVinculacion?.description ||
      opp?.tipoVinculacion?.value ||
      opp?.categoria?.description ||
      opp?.categoria?.value ||
      ""
  ).trim();

  let periodoCodigo = "";
  if (opp?.periodo && typeof opp.periodo === "object" && opp.periodo.codigo != null) {
    periodoCodigo = String(opp.periodo.codigo).trim();
  } else if (opp?.periodo && mongoose.Types.ObjectId.isValid(String(opp.periodo))) {
    const per = await Periodo.findById(opp.periodo).select("codigo").lean();
    if (per?.codigo != null) periodoCodigo = String(per.codigo).trim();
  }

  let programaStr = programas.join(", ");
  const plan = await PlanDeTrabajoMTM.findOne({ postulacionMTM: po._id }).select("periodo programa").lean();
  if (plan) {
    if (!periodoCodigo && plan.periodo) periodoCodigo = String(plan.periodo).trim();
    if (!programaStr && plan.programa) programaStr = String(plan.programa).trim();
  }

  const datos = buildVariablesPlantillaMtmEstudianteOportunidad({
    nombreEstudiante: po.postulant?.postulantId?.name,
    nombreCargo: opp?.nombreCargo,
    periodoCodigo,
    linkAprobarPlan: `/dashboard/monitorias/detalle/${String(po?._id || "")}`,
    tipoMonitoria,
    programa: programaStr,
    funciones: String(opp?.funciones || "").trim(),
  });
  return { po, opp, estudianteEmail, profEmail, datos };
}

/**
 * legalizaciones_mtm → postulacionMTM → oportunidadMTM (período, programas, etc.).
 */
export async function loadMtmPostulacionContextFromLegalizacion(legalizacionId) {
  if (!legalizacionId || !mongoose.Types.ObjectId.isValid(String(legalizacionId))) return null;
  const leg = await LegalizacionMTM.findById(legalizacionId).select("postulacionMTM").lean();
  if (!leg?.postulacionMTM) return null;
  return loadMtmPostulacionContext(leg.postulacionMTM);
}
