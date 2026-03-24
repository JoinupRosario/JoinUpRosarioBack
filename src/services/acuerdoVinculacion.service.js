/**
 * Flujo Acuerdo de Vinculación laboral.
 * Cuando el estudiante confirma su selección y la oportunidad es tipo "Acuerdo de vinculación",
 * la plataforma genera el PDF con tablas (estudiante, escenario, universidad, características)
 * y datos de la BD. No se usa plantilla externa.
 */
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
  const raw = typeof tipoVinculacion === "object"
    ? tipoVinculacion.value || tipoVinculacion.description || ""
    : tipoVinculacion;
  const n = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  return n(raw) === n(VALOR_TIPO_VINCULACION_ACUERDO);
}

/**
 * Tutor/monitor empresa: prioriza cierre de oportunidad (cierreDatosTutor por postulación), si no contacto de práctica.
 */
export function resolveTutorEmpresaParaAcuerdo(opp, postulacionId) {
  const arr = opp?.cierreDatosTutor || [];
  const row = arr.find((t) => t.postulacionId && String(t.postulacionId) === String(postulacionId));
  if (row) {
    return {
      nombres: [row.nombreTutor, row.apellidoTutor].filter(Boolean).join(" ").trim() || "—",
      tipoIdent: row.tipoIdentTutor || "C.C.",
      identificacion: safe(row.identificacionTutor) || "—",
    };
  }
  const company = opp?.company;
  const c = company?.contacts?.find((x) => x.isPracticeTutor) || company?.contacts?.[0];
  if (!c) {
    return { nombres: "—", tipoIdent: "C.C.", identificacion: "—" };
  }
  return {
    nombres: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "—",
    tipoIdent: c.idType || "C.C.",
    identificacion: safe(c.identification) || "—",
  };
}

function safe(v) {
  if (v == null || v === undefined) return "";
  return String(v).trim();
}

/**
 * Arma el payload del PDF (mismas tablas que la vista previa de parametrización) con datos reales de BD.
 * Usa tutor/monitor de empresa desde cierreDatosTutor (si existe) o contacto tutor de la compañía.
 */
export async function buildAcuerdoVinculacionPdfDataFromPostulacion(postulacionId) {
  const pid = String(postulacionId);
  const po = await PostulacionOportunidad.findById(pid)
    .populate("postulant")
    .populate({
      path: "opportunity",
      populate: [
        { path: "company" },
        { path: "tipoVinculacion", select: "value description" },
        { path: "dedicacion", select: "value description" },
        { path: "periodo", select: "codigo" },
      ],
    })
    .populate("postulantProfile")
    .lean();

  if (!po || !po.postulant || !po.opportunity) {
    return { ok: false, message: "Postulación no encontrada" };
  }

  const oppData = po.opportunity;
  const companyId = oppData?.company?._id ?? oppData?.company;
  const company = companyId ? await Company.findById(companyId).lean() : null;
  const oppForTutor = { ...oppData, company: company || oppData.company };

  const postulant = await Postulant.findById(po.postulant._id)
    .populate("postulantId", "name email code")
    .populate("typeOfIdentification", "value")
    .populate("cityResidenceId", "name")
    .lean();

  const profileId = po.postulantProfile?._id || po.postulantProfile;
  if (!profileId) {
    return { ok: false, message: "Perfil de postulante no encontrado" };
  }

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
  const periodoCodigo = oppData?.periodo?.codigo || "";
  const semestreCred = extra?.accordingCreditSemester != null ? String(extra.accordingCreditSemester) : null;

  const estudiante = {
    nombreApellidos: safe(postulant?.postulantId?.name) || "—",
    tipoDocumento: postulant?.typeOfIdentification?.value || "C.C.",
    numeroDocumento: safe(profile?.studentCode) || safe(postulant?.postulantId?.code) || "—",
    direccion: [safe(postulant?.address), safe(postulant?.cityResidenceId?.name)].filter(Boolean).join(" ").trim() || "—",
    facultad: firstEnrolled?.programFacultyId?.facultyId?.name || "—",
    programa: firstEnrolled?.programId?.name || firstEnrolled?.programId?.code || "—",
    semestre: semestreCred || periodoCodigo || "—",
    creditosAprobados: extra?.approvedCredits != null ? String(extra.approvedCredits) : "—",
  };

  const legalRep = company?.legalRepresentative;
  const repNombre = legalRep?.firstName || legalRep?.lastName
    ? [legalRep.firstName, legalRep.lastName].filter(Boolean).join(" ")
    : company?.contact?.name || "—";

  const tutorEmp = resolveTutorEmpresaParaAcuerdo(oppForTutor, pid);

  const escenario = {
    nombreOrganizacion: company?.legalName || company?.name || "—",
    tipoIdentificacion: "NIT",
    nit: safe(company?.nit || company?.idNumber) || "—",
    direccion: [safe(company?.address), safe(company?.city)].filter(Boolean).join(" ").trim() || "—",
    representanteLegalNombre: repNombre,
    representanteTipoDoc: company?.legalRepresentative?.idType || "C.C.",
    representanteNumeroDoc: safe(company?.legalRepresentative?.idNumber) || "—",
    tutorNombre: tutorEmp.nombres,
    tutorTipoDoc: tutorEmp.tipoIdent || "C.C.",
    tutorNumeroDoc: tutorEmp.identificacion || "—",
  };

  const universidad = {
    tipoIdentificacion: "NIT",
    numeroIdentificacion: safe(process.env.ACUERDO_UNIVERSIDAD_NIT) || "—",
    direccion: safe(process.env.ACUERDO_UNIVERSIDAD_DIRECCION) || "la ciudad de Bogotá D.C.",
    representanteNombre: safe(process.env.ACUERDO_UNIVERSIDAD_REPRESENTANTE) || "—",
    representanteTipoDoc: "C.C.",
    representanteNumeroDoc: safe(process.env.ACUERDO_UNIVERSIDAD_REP_DOC) || "—",
    monitorNombre: tutorEmp.nombres,
    monitorTipoDoc: tutorEmp.tipoIdent || "C.C.",
    monitorNumeroDoc: tutorEmp.identificacion || "—",
  };

  const dedicacionValue = oppData?.dedicacion?.value || oppData?.dedicacion?.description || "";
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

  const payload = { estudiante, escenario, universidad, practica, parametrizacion };
  return { ok: true, payload };
}

export { formatFechaHoraPdfBogota, buildRegistroFirmasRows, firmasTodasPendientes } from "./acuerdoVinculacionFirmas.util.js";

/**
 * Inicia el flujo: carga datos, genera el PDF del acuerdo y lo guarda.
 */
export async function iniciarFlujoAcuerdoVinculacion(postulacionId, opportunityId, opportunity = null) {
  const built = await buildAcuerdoVinculacionPdfDataFromPostulacion(postulacionId);
  if (!built.ok) return;

  const pdfBuffer = await buildAcuerdoVinculacionPdf(built.payload);

  const uploadsRoot = path.join(__dirname, "..", "uploads");
  const acuerdosDir = path.join(uploadsRoot, "acuerdos");
  await fs.mkdir(acuerdosDir, { recursive: true });
  const filename = `acuerdo-vinculacion-${String(postulacionId).slice(-8)}-${Date.now()}.pdf`;
  const filepath = path.join(acuerdosDir, filename);
  await fs.writeFile(filepath, pdfBuffer);

  console.log("[AcuerdoVinculacion] PDF generado:", filepath);
  return { filepath, buffer: pdfBuffer };
}
