/**
 * Servicio para calcular y persistir la completitud del perfil (perfilCompleto).
 * Solo cuenta campos que el estudiante puede ver/editar en el perfil:
 * datos personales (8) + código estudiante + idiomas + habilidades digitales (11 ítems).
 * Áreas de interés y competencias (skills) no son obligatorias para la HV.
 * Créditos/promedio/programa en curso no cuentan para este % ni para HV.
 */
import Postulant from "../models/postulants.schema.js";
import PostulantProfile from "../models/profile/profile.schema.js";
import ProfileInterestArea from "../models/profile/profileInterestArea.schema.js";
import ProfileSkill from "../models/profile/profileSkill.schema.js";
import ProfileLanguage from "../models/profile/profileLanguage.schema.js";

/** Claves Postulant que participan en completitud (orden estable). */
export const COMPLETENESS_DATOS_KEYS = [
  "typeOfIdentification",
  "gender",
  "phone",
  "address",
  "countryBirthId",
  "countryResidenceId",
  "stateResidenceId",
  "cityResidenceId",
];

const DATOS_PERSONALES_LABELS = Object.fromEntries(
  COMPLETENESS_DATOS_KEYS.map((key) => {
    const map = {
      typeOfIdentification: "Tipo de identificación",
      gender: "Género",
      phone: "Teléfono",
      address: "Dirección",
      countryBirthId: "País de nacimiento",
      countryResidenceId: "País de residencia",
      stateResidenceId: "Departamento de residencia",
      cityResidenceId: "Ciudad de residencia",
    };
    return [key, map[key]];
  })
);

const PERFIL_LABELS = [
  { key: "studentCode", label: "Código de estudiante" },
  { key: "languages", label: "Idiomas" },
  { key: "skillsTechnicalSoftware", label: "Habilidades digitales" },
];

function isFilledValue(v) {
  if (v == null || v === "") return false;
  if (typeof v !== "object") return true;
  if (v instanceof Date && !isNaN(v.getTime())) return true;
  if (v._id != null) return true;
  if (v.constructor && v.constructor.name === "ObjectId") return true;
  return false;
}

/**
 * Fallback cuando no hay perfil cargado (listados): solo la parte de datos personales
 * respecto al total de 11 ítems (máx. ~73% si datos están completos).
 */
export function calculateListFallbackCompleteness(postulant) {
  const filled = COMPLETENESS_DATOS_KEYS.filter((key) => isFilledValue(postulant?.[key])).length;
  const totalItems = COMPLETENESS_DATOS_KEYS.length + 3;
  return totalItems ? Math.min(100, Math.round((filled / totalItems) * 100)) : 0;
}

/**
 * Completitud para generar HV: datos personales + código estudiante + idiomas + habilidades digitales.
 * Áreas de interés y competencias no son obligatorias.
 * Créditos y promedio no intervienen.
 * Devuelve 0-100.
 */
export function calculateFullCompleteness(postulant, postulantProfile, profileData) {
  const itemsDatos = COMPLETENESS_DATOS_KEYS.map((key) => ({ ok: isFilledValue(postulant?.[key]) }));
  const hasStudentCode =
    postulantProfile?.studentCode != null && String(postulantProfile.studentCode).trim() !== "";
  const hasLangs = (profileData?.languages?.length ?? 0) > 0;
  const hasDigitalSkills =
    postulantProfile?.skillsTechnicalSoftware != null &&
    String(postulantProfile.skillsTechnicalSoftware).trim() !== "";
  const itemsPerfil = [
    { ok: hasStudentCode },
    { ok: hasLangs },
    { ok: hasDigitalSkills },
  ];
  const allItems = [...itemsDatos, ...itemsPerfil];
  const completed = allItems.filter((i) => i.ok).length;
  const total = allItems.length;
  return total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
}

/**
 * Devuelve la lista de campos que faltan por completar (etiquetas en español).
 */
export function getMissingCompletenessLabels(postulant, postulantProfile, profileData) {
  const missing = [];
  COMPLETENESS_DATOS_KEYS.forEach((key) => {
    if (!isFilledValue(postulant?.[key])) missing.push(DATOS_PERSONALES_LABELS[key]);
  });
  const hasStudentCode =
    postulantProfile?.studentCode != null && String(postulantProfile.studentCode).trim() !== "";
  const hasLangs = (profileData?.languages?.length ?? 0) > 0;
  const hasDigitalSkills =
    postulantProfile?.skillsTechnicalSoftware != null &&
    String(postulantProfile.skillsTechnicalSoftware).trim() !== "";
  if (!hasStudentCode) missing.push(PERFIL_LABELS[0].label);
  if (!hasLangs) missing.push(PERFIL_LABELS[1].label);
  if (!hasDigitalSkills) missing.push(PERFIL_LABELS[2].label);
  return missing;
}

/**
 * Recalcula perfilCompleto para un perfil y lo persiste en PostulantProfile y fillingPercentage en Postulant.
 * Si versionId viene, se usan idiomas de esa versión; habilidades digitales son del documento PostulantProfile (base).
 * Devuelve { perfilCompleto, fullPct }.
 */
export async function recalcAndSaveProfileCompleteness(postulantDocId, userId, profileId, versionId = null) {
  const profileFilter = userId
    ? { $or: [{ postulantId: postulantDocId }, { postulantId: userId }] }
    : { postulantId: postulantDocId };
  const versionFilter = versionId
    ? { profileId, profileVersionId: versionId }
    : { profileId, $or: [{ profileVersionId: null }, { profileVersionId: { $exists: false } }] };

  const [postulantFull, postulantProfile, interestAreas, skills, languages] = await Promise.all([
    Postulant.findById(postulantDocId)
      .select("typeOfIdentification gender phone address countryBirthId countryResidenceId stateResidenceId cityResidenceId")
      .lean(),
    PostulantProfile.findOne({ _id: profileId, ...profileFilter }).lean(),
    ProfileInterestArea.find(versionFilter).lean(),
    ProfileSkill.find(versionFilter).lean(),
    ProfileLanguage.find(versionFilter).lean(),
  ]);

  if (!postulantProfile || !postulantFull) return { perfilCompleto: false, fullPct: 0 };

  const profileDataForCalc = {
    interestAreas: interestAreas || [],
    skills: skills || [],
    languages: languages || [],
  };
  const fullPct = calculateFullCompleteness(postulantFull, postulantProfile, profileDataForCalc);
  const perfilCompleto = fullPct === 100;
  await PostulantProfile.updateOne({ _id: profileId }, { perfilCompleto });
  await Postulant.updateOne({ _id: postulantDocId }, { fillingPercentage: fullPct });
  const missingLabels = perfilCompleto ? [] : getMissingCompletenessLabels(postulantFull, postulantProfile, profileDataForCalc);
  return { perfilCompleto, fullPct, missingLabels };
}
