/**
 * Servicio para calcular y persistir la completitud del perfil (perfilCompleto).
 * Para generar HV solo se exige: datos personales + áreas de interés, competencias, idiomas y al menos una referencia.
 * No se exigen experiencia laboral, logros, otras experiencias, ni créditos/promedio académico.
 */
import Postulant from "../models/postulants.schema.js";
import PostulantProfile from "../models/profile/profile.schema.js";
import ProfileReference from "../models/profile/profileReference.schema.js";
import ProfileInterestArea from "../models/profile/profileInterestArea.schema.js";
import ProfileSkill from "../models/profile/profileSkill.schema.js";
import ProfileLanguage from "../models/profile/profileLanguage.schema.js";

const DATOS_PERSONALES_LABELS = {
  typeOfIdentification: "Tipo de identificación",
  gender: "Género",
  dateBirth: "Fecha de nacimiento",
  phone: "Teléfono",
  address: "Dirección",
  alternateEmail: "Correo alternativo",
  countryBirthId: "País de nacimiento",
  stateBirthId: "Departamento de nacimiento",
  cityBirthId: "Ciudad de nacimiento",
  countryResidenceId: "País de residencia",
  stateResidenceId: "Departamento de residencia",
  cityResidenceId: "Ciudad de residencia",
};

const PERFIL_LABELS = [
  { key: "interestAreas", label: "Áreas de interés" },
  { key: "skills", label: "Competencias" },
  { key: "languages", label: "Idiomas" },
  { key: "references", label: "Al menos una referencia" },
];

/**
 * Completitud para generar HV: datos personales + perfil (áreas, competencias, idiomas, al menos una referencia).
 * Créditos y promedio no intervienen.
 * Devuelve 0-100.
 */
export function calculateFullCompleteness(postulant, postulantProfile, profileData) {
  const isFilled = (v) => {
    if (v == null || v === "") return false;
    if (typeof v !== "object") return true;
    if (v instanceof Date && !isNaN(v.getTime())) return true;
    if (v._id != null) return true;
    if (v.constructor && v.constructor.name === "ObjectId") return true;
    return false;
  };
  const datosKeys = Object.keys(DATOS_PERSONALES_LABELS);
  const itemsDatos = datosKeys.map((key) => ({ ok: isFilled(postulant?.[key]) }));
  const hasRefs = (profileData?.references?.length ?? 0) > 0;
  const hasInterest = (profileData?.interestAreas?.length ?? 0) > 0;
  const hasSkills = (profileData?.skills?.length ?? 0) > 0;
  const hasLangs = (profileData?.languages?.length ?? 0) > 0;
  const itemsPerfil = [
    { ok: hasInterest },
    { ok: hasSkills },
    { ok: hasLangs },
    { ok: hasRefs },
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
  const isFilled = (v) => {
    if (v == null || v === "") return false;
    if (typeof v !== "object") return true;
    if (v instanceof Date && !isNaN(v.getTime())) return true;
    if (v._id != null) return true;
    if (v.constructor && v.constructor.name === "ObjectId") return true;
    return false;
  };
  const missing = [];
  const datosKeys = Object.keys(DATOS_PERSONALES_LABELS);
  datosKeys.forEach((key) => {
    if (!isFilled(postulant?.[key])) missing.push(DATOS_PERSONALES_LABELS[key]);
  });
  const hasRefs = (profileData?.references?.length ?? 0) > 0;
  const hasInterest = (profileData?.interestAreas?.length ?? 0) > 0;
  const hasSkills = (profileData?.skills?.length ?? 0) > 0;
  const hasLangs = (profileData?.languages?.length ?? 0) > 0;
  if (!hasInterest) missing.push(PERFIL_LABELS[0].label);
  if (!hasSkills) missing.push(PERFIL_LABELS[1].label);
  if (!hasLangs) missing.push(PERFIL_LABELS[2].label);
  if (!hasRefs) missing.push(PERFIL_LABELS[3].label);
  return missing;
}

/**
 * Recalcula perfilCompleto para un perfil y lo persiste en PostulantProfile y fillingPercentage en Postulant.
 * Si versionId viene, se usan áreas/competencias/idiomas de esa versión; si no, del perfil base.
 * Devuelve { perfilCompleto, fullPct }.
 */
export async function recalcAndSaveProfileCompleteness(postulantDocId, userId, profileId, versionId = null) {
  const profileFilter = userId
    ? { $or: [{ postulantId: postulantDocId }, { postulantId: userId }] }
    : { postulantId: postulantDocId };
  const versionFilter = versionId
    ? { profileId, profileVersionId: versionId }
    : { profileId, $or: [{ profileVersionId: null }, { profileVersionId: { $exists: false } }] };

  const [postulantFull, postulantProfile, references, interestAreas, skills, languages] =
    await Promise.all([
      Postulant.findById(postulantDocId)
        .select("typeOfIdentification gender dateBirth phone address alternateEmail countryBirthId stateBirthId cityBirthId countryResidenceId stateResidenceId cityResidenceId")
        .lean(),
      PostulantProfile.findOne({ _id: profileId, ...profileFilter }).lean(),
      ProfileReference.find({ profileId }).lean(),
      ProfileInterestArea.find(versionFilter).lean(),
      ProfileSkill.find(versionFilter).lean(),
      ProfileLanguage.find(versionFilter).lean(),
    ]);

  if (!postulantProfile || !postulantFull) return { perfilCompleto: false, fullPct: 0 };

  const profileDataForCalc = {
    references: references || [],
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
