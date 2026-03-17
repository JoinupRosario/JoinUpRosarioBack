/**
 * Flujo Acuerdo de Vinculación laboral.
 * Cuando el estudiante confirma su selección y la oportunidad es tipo "Acuerdo de vinculación",
 * la plataforma genera el PDF con tablas (estudiante, escenario, universidad, características)
 * y datos de la BD. No se usa plantilla externa.
 */
import Opportunity from "../modules/opportunities/opportunity.model.js";
import PostulacionOportunidad from "../modules/opportunities/postulacionOportunidad.model.js";
import Company from "../modules/companies/company.model.js";
import Postulant from "../modules/postulants/models/postulants.schema.js";
import PostulantProfile from "../modules/postulants/models/profile/profile.schema.js";
import { ProfileEnrolledProgram, ProfileProgramExtraInfo } from "../modules/postulants/models/profile/index.js";
import DocumentParametrization from "../modules/parametrizacionDocumentos/documentParametrization.schema.js";
import { buildAcuerdoVinculacionPdf } from "./acuerdoVinculacionPdf.service.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALOR_TIPO_VINCULACION_ACUERDO = "Acuerdo de vinculación";

export function esAcuerdoDeVinculacion(tipoVinculacion) {
  if (!tipoVinculacion) return false;
  const value = typeof tipoVinculacion === "object" ? tipoVinculacion.value : tipoVinculacion;
  return String(value || "").trim() === VALOR_TIPO_VINCULACION_ACUERDO;
}

function safe(v) {
  if (v == null || v === undefined) return "";
  return String(v).trim();
}

/**
 * Inicia el flujo: carga datos, genera el PDF del acuerdo y lo guarda.
 */
export async function iniciarFlujoAcuerdoVinculacion(postulacionId, opportunityId, opportunity = null) {
  let opp = opportunity;
  if (!opp) {
    opp = await Opportunity.findById(opportunityId)
      .populate("tipoVinculacion", "value")
      .populate("company")
      .populate("dedicacion", "value")
      .populate("periodo", "codigo")
      .lean();
  }
  if (!opp) return;

  const po = await PostulacionOportunidad.findById(postulacionId)
    .populate("postulant")
    .populate({
      path: "opportunity",
      populate: [
        { path: "company" },
        { path: "dedicacion", select: "value" },
        { path: "periodo", select: "codigo" },
      ],
    })
    .populate("postulantProfile")
    .lean();
  if (!po || !po.postulant || !po.opportunity) return;

  const companyId = po.opportunity?.company?._id ?? po.opportunity?.company ?? opp?.company?._id ?? opp?.company;
  const company = companyId ? await Company.findById(companyId).lean() : null;
  const postulant = await Postulant.findById(po.postulant._id)
    .populate("postulantId", "name email")
    .populate("typeOfIdentification", "value")
    .populate("cityResidenceId", "name")
    .lean();
  const profileId = po.postulantProfile?._id || po.postulantProfile;
  if (!profileId) return;

  const enrolledPrograms = await ProfileEnrolledProgram.find({ profileId })
    .populate("programId", "name code")
    .populate({ path: "programFacultyId", populate: { path: "facultyId", select: "name" } })
    .lean();
  const enrolledIds = enrolledPrograms.map((e) => e._id);
  const [programExtraInfoList, parametrizacionDoc] = await Promise.all([
    enrolledIds.length > 0
      ? ProfileProgramExtraInfo.find({ enrolledProgramId: { $in: enrolledIds } }).lean()
      : [],
    DocumentParametrization.findOne({ type: "acuerdo_vinculacion" }).lean(),
  ]);

  const profile = await PostulantProfile.findById(profileId).select("studentCode").lean();
  const firstEnrolled = enrolledPrograms.find((e) => e.programFacultyId != null) || enrolledPrograms[0];
  const extra = firstEnrolled
    ? programExtraInfoList.find((ex) => String(ex.enrolledProgramId) === String(firstEnrolled._id))
    : null;
  const oppData = po.opportunity || opp;
  const periodo = oppData?.periodo?.codigo || "";

  const estudiante = {
    nombreApellidos: safe(postulant?.postulantId?.name) || "—",
    tipoDocumento: postulant?.typeOfIdentification?.value || "C.C.",
    numeroDocumento: safe(profile?.studentCode) || safe(postulant?.postulantId?.code) || "—",
    direccion: [safe(postulant?.address), safe(postulant?.cityResidenceId?.name)].filter(Boolean).join(" ").trim() || "—",
    facultad: firstEnrolled?.programFacultyId?.facultyId?.name || "—",
    programa: firstEnrolled?.programId?.name || firstEnrolled?.programId?.code || "—",
    semestre: periodo || "—",
    creditosAprobados: extra?.approvedCredits != null ? String(extra.approvedCredits) : "—",
  };

  const legalRep = company?.legalRepresentative;
  const repNombre = legalRep?.firstName || legalRep?.lastName
    ? [legalRep.firstName, legalRep.lastName].filter(Boolean).join(" ")
    : company?.contact?.name || "—";
  const tutorContact = company?.contacts?.find((c) => c.isPracticeTutor) || company?.contacts?.[0];
  const tutorNombre = tutorContact
    ? [tutorContact.firstName, tutorContact.lastName].filter(Boolean).join(" ").trim() || "—"
    : "—";

  const escenario = {
    nombreOrganizacion: company?.name || company?.legalName || "—",
    tipoIdentificacion: "NIT",
    nit: safe(company?.nit || company?.idNumber) || "—",
    direccion: [safe(company?.address), safe(company?.city)].filter(Boolean).join(" ").trim() || "—",
    representanteLegalNombre: repNombre,
    representanteTipoDoc: company?.legalRepresentative?.idType || "C.C.",
    representanteNumeroDoc: safe(company?.legalRepresentative?.idNumber) || "—",
    tutorNombre,
    tutorTipoDoc: tutorContact?.idType || "C.C.",
    tutorNumeroDoc: safe(tutorContact?.identification) || "—",
  };

  const universidad = {
    tipoIdentificacion: "NIT",
    numeroIdentificacion: "—",
    representanteNombre: "—",
    representanteTipoDoc: "C.C.",
    representanteNumeroDoc: "—",
    monitorNombre: "—",
    monitorTipoDoc: "C.C.",
    monitorNumeroDoc: "—",
  };

  const dedicacionValue = oppData?.dedicacion?.value || "";
  const practica = {
    fechaInicio: oppData?.fechaInicioPractica ?? null,
    fechaFin: oppData?.fechaFinPractica ?? null,
    dedicacion: dedicacionValue || "—",
    horario: safe(oppData?.horario) || "—",
    fechaEvaluacionParcial: null,
    fechaEvaluacionFinal: null,
    conAuxilio: oppData?.auxilioEconomico ?? false,
    valor: oppData?.apoyoEconomico ?? null,
  };

  const parametrizacion = {
    logoBase64: parametrizacionDoc?.logoBase64 ?? null,
    textosLegalesAcuerdo: parametrizacionDoc?.textosLegalesAcuerdo ?? "",
  };

  const pdfBuffer = await buildAcuerdoVinculacionPdf({
    estudiante,
    escenario,
    universidad,
    practica,
    parametrizacion,
  });

  const uploadsRoot = path.join(__dirname, "..", "uploads");
  const acuerdosDir = path.join(uploadsRoot, "acuerdos");
  await fs.mkdir(acuerdosDir, { recursive: true });
  const filename = `acuerdo-vinculacion-${String(postulacionId).slice(-8)}-${Date.now()}.pdf`;
  const filepath = path.join(acuerdosDir, filename);
  await fs.writeFile(filepath, pdfBuffer);

  console.log("[AcuerdoVinculacion] PDF generado:", filepath);
  return { filepath, buffer: pdfBuffer };
}
