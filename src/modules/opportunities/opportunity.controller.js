import mongoose from "mongoose";
import Opportunity from "./opportunity.model.js";
import Company from "../companies/company.model.js";
import Student from "../students/student.model.js";
import EstudianteHabilitado from "../estudiantesHabilitados/estudianteHabilitado.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";
import PostulacionOportunidad from "./postulacionOportunidad.model.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram, ProfileSkill, ProfileCv } from "../postulants/models/profile/index.js";
import Periodo from "../periodos/periodo.model.js";
import Country from "../shared/location/models/country.schema.js";
import City from "../shared/location/models/city.schema.js";
import Item from "../shared/reference-data/models/item.schema.js";
import Parameter from "../parameters/parameter.model.js";
import LegalizacionPractica from "../legalizacionPractica/legalizacionPractica.model.js";
import UserAdministrativo from "../usersAdministrativos/userAdministrativo.model.js";
import Program from "../program/model/program.model.js";
import { dispatchNotificationByEvent } from "../notificacion/application/dispatchNotificationByEvent.service.js";
import { parseEnvEmailList } from "../notificacion/application/resolveRecipientEmails.js";
import {
  loadPracticaPostulacionContext,
  dispatchPracticaNotification,
  entityAndCoordinatorsRecipientContext,
  studentOnlyRecipientContext,
  buildDatosPracticaSimple,
  findOtrasPostulacionesActivas,
  practicaOpportunityDashboardLink,
} from "../notificacion/application/practicaOpportunityNotifications.helper.js";
import { buildSearchRegex, escapeRegex } from "../../utils/searchUtils.js";

const CODE_MAX_JORNADA_ORDINARIA = "PRACTICE_MAX_JORNADA_ORDINARIA_SEMANAL";
const CODE_MIN_APOYO_ECONOMICO_COP = "PRACTICE_MIN_APOYO_ECONOMICO_COP";
const CODE_PRACTICE_END_DAYS_AFTER_START = "PRACTICE_END_DAYS_AFTER_START";
const DEFAULT_MIN_APOYO_COP = 1750905;

/** Misma regla que creación de oportunidades de práctica (días mínimos entre inicio y fin). */
async function getPracticeEndDaysAfterStart() {
  try {
    const p = await Parameter.findOne({ code: CODE_PRACTICE_END_DAYS_AFTER_START, "metadata.active": true }).lean();
    const v = p?.value;
    const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 365) return n;
  } catch (_) {}
  return 1;
}

async function getMinApoyoEconomicoCop() {
  try {
    const p = await Parameter.findOne({ code: CODE_MIN_APOYO_ECONOMICO_COP, "metadata.active": true }).lean();
    const v = p?.value;
    const n = typeof v === "number" ? v : parseInt(String(v || "").replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n >= 500000 && n <= 50000000) return n;
  } catch (_) {}
  return DEFAULT_MIN_APOYO_COP;
}

/**
 * RQ04_HU004: al aceptar la práctica se crea de inmediato el expediente de legalización (borrador),
 * para que listados/admin vean la gestión sin depender de que el estudiante abra el detalle.
 */
async function ensureLegalizacionPracticaOnAcceptance(postulacionOportunidadId, userId = null, historialDetalle = null) {
  try {
    const pid = postulacionOportunidadId?.toString?.() ?? postulacionOportunidadId;
    if (!pid || !mongoose.Types.ObjectId.isValid(pid)) return;
    const exists = await LegalizacionPractica.exists({ postulacionOportunidad: pid });
    if (exists) return;
    await LegalizacionPractica.create({
      postulacionOportunidad: pid,
      estado: "borrador",
      historial: [
        {
          estadoAnterior: null,
          estadoNuevo: "borrador",
          usuario: userId || null,
          fecha: new Date(),
          detalle: historialDetalle || "Legalización creada al aceptar la práctica.",
          ip: null,
        },
      ],
    });
  } catch (e) {
    console.error("[opportunities] ensureLegalizacionPracticaOnAcceptance:", e?.message || e);
  }
}

async function getMaxJornadaOrdinariaSemanal() {
  try {
    const p = await Parameter.findOne({ code: CODE_MAX_JORNADA_ORDINARIA, "metadata.active": true }).lean();
    const v = p?.value;
    const n = typeof v === "number" ? v : parseInt(String(v || ""), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 48) return n;
  } catch (_) {}
  return 44;
}

function validateJornadaPractica(restData) {
  const tipo = String(restData.tipo || "").toLowerCase();
  if (tipo !== "practica") return null;
  const jo = restData.jornadaOrdinariaSemanal;
  if (jo == null || jo === "") return null;
  const n = parseInt(jo, 10);
  if (Number.isNaN(n)) return null;
  return n;
}

const OBJECTID_REGEX = /^[a-f0-9]{24}$/i;
const LIST_ID_INTEREST_AREA = "L_INTEREST_AREA";
const LIST_ID_EMOTIONAL_SALARY = "L_EMOTIONAL_SALARY";
const LIST_ID_DEDICATION_JOB_OFFER = "L_DEDICATION_JOB_OFFER";
const LIST_ID_CONTRACT_TYPE_ACADEMIC_PRACTICE = "L_CONTRACT_TYPE_ACADEMIC_PRACTICE";

/** Normaliza periodo, pais y ciudad a ObjectId (refs). Acepta código o id. Modifica data in-place. */
async function normalizeOpportunityRefs(data) {
  if (data.periodo != null && data.periodo !== "") {
    const v = String(data.periodo).trim();
    if (OBJECTID_REGEX.test(v)) {
      data.periodo = new mongoose.Types.ObjectId(v);
    } else {
      const doc = await Periodo.findOne({ codigo: v }).select("_id").lean();
      data.periodo = doc ? doc._id : null;
    }
  }
  if (data.pais != null && data.pais !== "") {
    const v = String(data.pais).trim();
    if (OBJECTID_REGEX.test(v)) {
      data.pais = new mongoose.Types.ObjectId(v);
    } else {
      const doc = await Country.findOne({
        $or: [{ sortname: v }, { isoAlpha2: v }, { name: new RegExp(`^${escapeRegex(v)}$`, "i") }
        ]
      }).select("_id").lean();
      data.pais = doc ? doc._id : null;
    }
  }
  if (data.ciudad != null && data.ciudad !== "") {
    const v = String(data.ciudad).trim();
    if (OBJECTID_REGEX.test(v)) {
      data.ciudad = new mongoose.Types.ObjectId(v);
    } else {
      const doc = await City.findOne({ name: new RegExp(`^${escapeRegex(v)}$`, "i") }).select("_id").lean();
      data.ciudad = doc ? doc._id : null;
    }
  }

  // Área de desempeño: ref Item (L_INTEREST_AREA)
  if (data.areaDesempeno != null && data.areaDesempeno !== "") {
    const v = data.areaDesempeno;
    if (v._id && OBJECTID_REGEX.test(String(v._id))) {
      data.areaDesempeno = new mongoose.Types.ObjectId(v._id);
    } else {
      const s = String(v).trim();
      if (OBJECTID_REGEX.test(s)) {
        data.areaDesempeno = new mongoose.Types.ObjectId(s);
      } else {
        const doc = await Item.findOne({
          listId: LIST_ID_INTEREST_AREA,
          $or: [
            { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
            { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
          ]
        }).select("_id").lean();
        data.areaDesempeno = doc ? doc._id : null;
      }
    }
  }

  // Salario emocional: array de refs Item (L_EMOTIONAL_SALARY)
  if (Array.isArray(data.salarioEmocional)) {
    const resolved = [];
    for (const entry of data.salarioEmocional) {
      if (entry == null || entry === "") continue;
      const v = entry;
      if (v._id && OBJECTID_REGEX.test(String(v._id))) {
        resolved.push(new mongoose.Types.ObjectId(v._id));
      } else {
        const s = String(v).trim();
        if (OBJECTID_REGEX.test(s)) {
          resolved.push(new mongoose.Types.ObjectId(s));
        } else {
          const doc = await Item.findOne({
            listId: LIST_ID_EMOTIONAL_SALARY,
            $or: [
              { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
              { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
            ]
          }).select("_id").lean();
          if (doc) resolved.push(doc._id);
        }
      }
    }
    data.salarioEmocional = resolved;
  }

  // Dedicación: ref Item (L_DEDICATION_JOB_OFFER)
  if (data.dedicacion != null && data.dedicacion !== "") {
    const v = data.dedicacion;
    if (v._id && OBJECTID_REGEX.test(String(v._id))) {
      data.dedicacion = new mongoose.Types.ObjectId(v._id);
    } else {
      const s = String(v).trim();
      if (OBJECTID_REGEX.test(s)) {
        data.dedicacion = new mongoose.Types.ObjectId(s);
      } else {
        const doc = await Item.findOne({
          listId: LIST_ID_DEDICATION_JOB_OFFER,
          $or: [
            { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
            { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
          ]
        }).select("_id").lean();
        data.dedicacion = doc ? doc._id : null;
      }
    }
  }

  // Tipo de vinculación: ref Item (L_CONTRACT_TYPE_ACADEMIC_PRACTICE)
  if (data.tipoVinculacion != null && data.tipoVinculacion !== "") {
    const v = data.tipoVinculacion;
    if (v._id && OBJECTID_REGEX.test(String(v._id))) {
      data.tipoVinculacion = new mongoose.Types.ObjectId(v._id);
    } else {
      const s = String(v).trim();
      if (OBJECTID_REGEX.test(s)) {
        data.tipoVinculacion = new mongoose.Types.ObjectId(s);
      } else {
        const doc = await Item.findOne({
          listId: LIST_ID_CONTRACT_TYPE_ACADEMIC_PRACTICE,
          $or: [
            { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
            { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
          ]
        }).select("_id").lean();
        data.tipoVinculacion = doc ? doc._id : null;
      }
    }
  }
}

/**
 * GET /opportunities/autogestionada/buscar-perfil?studentCode=
 * RQ04_HU004: datos del estudiante para creación de legalización autogestionada.
 */
export const buscarPerfilParaAutogestionada = async (req, res) => {
  try {
    const studentCode = String(req.query.studentCode || "").trim();
    if (!studentCode) {
      return res.status(400).json({ message: "Indique número de identificación del estudiante" });
    }
    /** postulantId del perfil → Postulant; nombre/correo en Postulant.postulantId → User */
    const profile = await PostulantProfile.findOne({ studentCode })
      .populate({
        path: "postulantId",
        select: "postulantId alternateEmail",
        populate: { path: "postulantId", select: "name email" },
      })
      .lean();
    if (!profile) {
      return res.status(404).json({ message: "No se encontró perfil con esa identificación" });
    }
    const postulantDoc = profile.postulantId;
    const userDoc = postulantDoc?.postulantId;
    const nombre = userDoc?.name || "";
    const email = userDoc?.email || postulantDoc?.alternateEmail || "";

    const enrolledRows = await ProfileEnrolledProgram.find({ profileId: profile._id })
      .populate("programId", "name code level labelLevel")
      .populate({ path: "programFacultyId", populate: { path: "facultyId", select: "name" } })
      .sort({ _id: 1 })
      .lean();

    const programas = enrolledRows.map((row) => {
      const prog = row.programId;
      const level = String(prog?.level || prog?.labelLevel || "PREGRADO").trim() || "PREGRADO";
      const programName = String(prog?.name || prog?.code || "").trim();
      const facultad = row.programFacultyId?.facultyId?.name || "";
      return {
        enrolledProgramId: row._id,
        level,
        program: programName,
        facultad,
        label: facultad ? `${level} — ${programName} · ${facultad}` : `${level} — ${programName}`,
      };
    });

    const first = programas[0];
    return res.json({
      postulantProfileId: profile._id,
      nombre,
      email,
      /** @deprecated usar programas; se mantiene por compatibilidad */
      programa: first?.program || "",
      facultad: first?.facultad || "",
      programas,
    });
  } catch (err) {
    console.error("[opportunities] buscarPerfilParaAutogestionada:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /opportunities/autogestionada/empresas
 * Listado breve de entidades para el formulario de práctica autogestionada (líder / admin).
 */
export const getEmpresasParaAutogestionada = async (req, res) => {
  try {
    const companies = await Company.find({})
      .select("_id nit commercialName name legalName")
      .sort({ commercialName: 1, name: 1 })
      .limit(500)
      .lean();
    res.json({ data: companies });
  } catch (err) {
    console.error("[opportunities] getEmpresasParaAutogestionada:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /opportunities/practica-autogestionada
 * RQ04_HU004: el líder de práctica registra la oferta y deja al estudiante en estado aceptado con expediente de legalización.
 */
export const crearPracticaAutogestionada = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const body = req.body || {};
    const {
      postulantProfileId,
      company: companyId,
      tutor,
      nombreCargo,
      requisitos,
      funciones,
      periodo,
      tipoVinculacion,
      formacionAcademica,
      dedicacion,
      pais,
      ciudad,
      areaDesempeno,
      fechaInicioPractica,
      fechaFinPractica,
      horario,
      jornadaOrdinariaSemanal,
      auxilioEconomico,
      apoyoEconomico,
      promedioMinimoRequerido,
    } = body;

    const reqStr = (v) => (typeof v === "string" ? v.trim() : v);
    const missing = [];
    if (!postulantProfileId || !mongoose.Types.ObjectId.isValid(String(postulantProfileId))) missing.push("postulantProfileId");
    if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) missing.push("company");
    if (!reqStr(nombreCargo)) missing.push("nombreCargo");
    if (!reqStr(requisitos)) missing.push("requisitos");
    if (!reqStr(funciones) || String(funciones).trim().length < 60) missing.push("funciones (mínimo 60 caracteres)");
    if (periodo == null || periodo === "") missing.push("periodo");
    if (tipoVinculacion == null || tipoVinculacion === "") missing.push("tipoVinculacion");
    const tieneEnrolledId =
      body.enrolledProgramId != null &&
      body.enrolledProgramId !== "" &&
      mongoose.Types.ObjectId.isValid(String(body.enrolledProgramId));
    if (!tieneEnrolledId && (!Array.isArray(formacionAcademica) || !formacionAcademica.length)) {
      missing.push("formacionAcademica o enrolledProgramId");
    }
    if (dedicacion == null || dedicacion === "") missing.push("dedicacion");
    if (pais == null || pais === "") missing.push("pais");
    if (ciudad == null || ciudad === "") missing.push("ciudad");
    if (areaDesempeno == null || areaDesempeno === "") missing.push("areaDesempeno");
    if (!fechaInicioPractica) missing.push("fechaInicioPractica");
    if (!fechaFinPractica) missing.push("fechaFinPractica");
    if (!reqStr(horario)) missing.push("horario");
    if (jornadaOrdinariaSemanal == null || jornadaOrdinariaSemanal === "") missing.push("jornadaOrdinariaSemanal");

    const t = tutor || {};
    const tutorReq = ["nombreTutor", "apellidoTutor", "emailTutor", "cargoTutor", "tipoIdentTutor", "identificacionTutor"];
    for (const k of tutorReq) {
      if (!reqStr(t[k])) missing.push(`tutor.${k}`);
    }

    if (missing.length) {
      return res.status(400).json({ message: `Campos obligatorios pendientes: ${missing.join(", ")}` });
    }

    if (mongoose.Types.ObjectId.isValid(String(ciudad)) && mongoose.Types.ObjectId.isValid(String(pais))) {
      const cityDoc = await City.findById(ciudad).populate({ path: "state", select: "country" }).lean();
      if (!cityDoc?.state?.country) {
        return res.status(400).json({ message: "Ciudad no válida" });
      }
      if (String(cityDoc.state.country) !== String(pais)) {
        return res.status(400).json({ message: "La ciudad no pertenece al país seleccionado" });
      }
    }

    const inicioYMD = String(fechaInicioPractica).slice(0, 10);
    const finYMD = String(fechaFinPractica).slice(0, 10);
    const parseYMD = (s) => {
      const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
      if (!y || !m || !d) return null;
      return new Date(y, m - 1, d);
    };
    const tInicio = parseYMD(inicioYMD);
    const tFin = parseYMD(finYMD);
    if (!tInicio || !tFin || Number.isNaN(tInicio.getTime()) || Number.isNaN(tFin.getTime())) {
      return res.status(400).json({ message: "Fechas de práctica no válidas" });
    }
    const gapDays = await getPracticeEndDaysAfterStart();
    const minFin = new Date(tInicio);
    minFin.setDate(minFin.getDate() + gapDays);
    if (tFin < minFin) {
      return res.status(400).json({
        message: `La fecha de fin debe ser al menos ${gapDays} día(s) después de la fecha de inicio (regla de negocio).`,
      });
    }

    const profile = await PostulantProfile.findById(postulantProfileId).lean();
    if (!profile) return res.status(404).json({ message: "Perfil no encontrado" });
    const postulantDoc = await Postulant.findById(profile.postulantId).lean();
    if (!postulantDoc) return res.status(400).json({ message: "Postulante no encontrado" });

    let forFac = Array.isArray(formacionAcademica)
      ? formacionAcademica.filter((f) => f && reqStr(f.level) && reqStr(f.program))
      : [];
    const eid = body.enrolledProgramId;
    if (eid != null && eid !== "" && mongoose.Types.ObjectId.isValid(String(eid))) {
      const enr = await ProfileEnrolledProgram.findOne({
        _id: eid,
        profileId: profile._id,
      })
        .populate("programId", "name code level labelLevel")
        .lean();
      if (!enr) {
        return res.status(400).json({ message: "El programa académico seleccionado no corresponde al perfil del estudiante" });
      }
      const prog = enr.programId;
      const level = String(prog?.level || prog?.labelLevel || "PREGRADO").trim() || "PREGRADO";
      const programName = String(prog?.name || prog?.code || "").trim();
      if (!programName) {
        return res.status(400).json({ message: "Datos del programa académico incompletos" });
      }
      forFac = [{ level, program: programName }];
    } else if (!forFac.length) {
      return res.status(400).json({ message: "Indique nivel y programa académico, o seleccione el programa inscrito del estudiante" });
    }

    const yaTieneAceptada = await PostulacionOportunidad.exists({
      postulant: postulantDoc._id,
      estado: "aceptado_estudiante",
    });
    if (yaTieneAceptada) {
      return res.status(400).json({
        message:
          "El estudiante ya tiene una práctica aceptada. Cierre o gestione esa legalización antes de registrar otra autogestionada.",
      });
    }

    const companyDoc = await Company.findById(companyId).lean();
    if (!companyDoc) return res.status(404).json({ message: "Empresa no encontrada" });
    if (!String(companyDoc.nit || companyDoc.idNumber || "").trim()) {
      return res.status(400).json({ message: "La entidad debe tener NIT o número de identificación registrado" });
    }

    const restData = {
      tipo: "practica",
      practicaAutogestionada: true,
      nombreCargo: reqStr(nombreCargo),
      requisitos: reqStr(requisitos),
      funciones: reqStr(funciones),
      formacionAcademica: forFac.map((f) => ({ level: reqStr(f.level), program: reqStr(f.program) })),
      periodo,
      tipoVinculacion,
      dedicacion,
      pais,
      ciudad,
      areaDesempeno,
      fechaInicioPractica: new Date(fechaInicioPractica),
      fechaFinPractica: new Date(fechaFinPractica),
      horario: reqStr(horario),
      jornadaOrdinariaSemanal: parseInt(String(jornadaOrdinariaSemanal), 10),
      /** Una sola dedicación horaria semanal (misma regla que módulo Oportunidades de práctica). */
      jornadaSemanalPractica: parseInt(String(jornadaOrdinariaSemanal), 10),
      auxilioEconomico: Boolean(auxilioEconomico),
      apoyoEconomico:
        apoyoEconomico != null && apoyoEconomico !== "" ? parseInt(String(apoyoEconomico).replace(/\D/g, ""), 10) : null,
      promedioMinimoRequerido: promedioMinimoRequerido != null ? String(promedioMinimoRequerido).trim() : null,
      company: companyId,
      vacantes: 1,
    };

    await normalizeOpportunityRefs(restData);

    if (!restData.periodo) return res.status(400).json({ message: "Período académico no válido" });
    if (!restData.tipoVinculacion) return res.status(400).json({ message: "Tipo de vinculación no válido" });
    if (!restData.dedicacion) return res.status(400).json({ message: "Dedicación no válida" });
    if (!restData.pais) return res.status(400).json({ message: "País no válido" });
    if (!restData.ciudad) return res.status(400).json({ message: "Ciudad no válida" });
    if (!restData.areaDesempeno) return res.status(400).json({ message: "Área de desempeño no válida" });

    const maxH = await getMaxJornadaOrdinariaSemanal();
    const n = validateJornadaPractica(restData);
    if (n != null && n > maxH) {
      return res.status(400).json({ message: `La jornada ordinaria semanal no puede superar ${maxH} horas.` });
    }

    if (restData.auxilioEconomico === true) {
      const minAp = await getMinApoyoEconomicoCop();
      const ap = parseInt(String(restData.apoyoEconomico ?? "").replace(/\D/g, ""), 10);
      if (!Number.isFinite(ap) || ap < minAp) {
        return res.status(400).json({
          message: `Con auxilio económico activo, el apoyo debe ser al menos $${minAp.toLocaleString("es-CO")} COP.`,
        });
      }
    }

    const aprobacionesPorPrograma = restData.formacionAcademica.map((f) => ({
      programa: { level: f.level, program: f.program },
      estado: "aprobado",
      aprobadoPor: userId,
      fechaAprobacion: new Date(),
    }));

    const now = new Date();
    let opportunityId = null;
    let po = null;

    try {
      const opportunity = await Opportunity.create({
        ...restData,
        estado: "Activa",
        creadoPor: userId,
        fechaCreacion: now,
        fechaActivacion: now,
        aprobacionesPorPrograma,
        historialEstados: [
          {
            estadoAnterior: null,
            estadoNuevo: "Activa",
            cambiadoPor: userId,
            fechaCambio: now,
            comentarios: "Alta autogestionada por líder de práctica (RQ04_HU004)",
          },
        ],
      });
      opportunityId = opportunity._id;

      po = await PostulacionOportunidad.create({
        postulant: postulantDoc._id,
        opportunity: opportunityId,
        postulantProfile: profile._id,
        estado: "aceptado_estudiante",
        aceptadoEstudianteAt: now,
        comentarios: "Práctica autogestionada registrada por líder de práctica (legalización)",
        revisadoPor: userId,
      });

      await Opportunity.findByIdAndUpdate(opportunityId, {
        $set: {
          cierreDatosTutor: [
            {
              postulacionId: po._id,
              nombreTutor: reqStr(t.nombreTutor),
              apellidoTutor: reqStr(t.apellidoTutor),
              emailTutor: reqStr(t.emailTutor),
              cargoTutor: reqStr(t.cargoTutor),
              tipoIdentTutor: reqStr(t.tipoIdentTutor),
              arlEmpresa: t.arlEmpresa != null ? String(t.arlEmpresa).trim() : "",
              identificacionTutor: reqStr(t.identificacionTutor),
              fechaInicioPractica: restData.fechaInicioPractica,
            },
          ],
        },
      });

      const otrosDocs = await findOtrasPostulacionesActivas(postulantDoc._id, po._id);
      const otrasPostulacionIds = otrosDocs.map((d) => d._id);
      await PostulacionOportunidad.updateMany(
        {
          postulant: postulantDoc._id,
          _id: { $ne: po._id },
          estado: { $in: ["aplicado", "empresa_consulto_perfil", "empresa_descargo_hv", "seleccionado_empresa"] },
        },
        {
          $set: {
            estado: "rechazado",
            rechazadoAt: now,
            comentarios: "No continúa el proceso: se registró práctica autogestionada por coordinación/líder",
            aceptadoEstudianteAt: null,
          },
        }
      );

      await ensureLegalizacionPracticaOnAcceptance(
        po._id,
        userId,
        "Legalización creada (práctica autogestionada por líder de práctica)."
      );

      const ctx = await loadPracticaPostulacionContext(po._id);
      if (ctx) {
        await dispatchPracticaNotification(
          "aceptacion_inscripcion_oportunidad_estudiantes",
          {
            ...ctx.datos,
            COMENTARIO:
              "Se registró una práctica autogestionada. Ingrese a Legalizaciones de prácticas para cargar la documentación requerida.",
          },
          studentOnlyRecipientContext(ctx.postulantEmail),
          { postulacionId: String(po._id), opportunityId: String(opportunityId), source: "practica_autogestionada" }
        );
        for (const oid of otrasPostulacionIds) {
          const ctxO = await loadPracticaPostulacionContext(oid);
          if (!ctxO) continue;
          await dispatchPracticaNotification(
            "notificacion_entidad_estudiante_no_continua",
            {
              ...ctxO.datos,
              OBSERVACION: "Se registró otra práctica autogestionada para el estudiante. Esta postulación quedó sin continuidad.",
            },
            entityAndCoordinatorsRecipientContext(ctxO.creadorEmail),
            { postulacionId: String(oid), opportunityId: String(ctxO.po.opportunity), source: "practica_autogestionada" }
          );
        }
      }

      const populated = await PostulacionOportunidad.findById(po._id)
        .populate({ path: "opportunity", select: "nombreCargo practicaAutogestionada estado periodo" })
        .populate("postulantProfile", "studentCode")
        .lean();

      return res.status(201).json({
        message: "Práctica autogestionada registrada. El estudiante puede cargar documentos de legalización.",
        postulacion: populated,
        postulacionId: po._id,
        opportunityId,
      });
    } catch (err) {
      if (po?._id) await PostulacionOportunidad.deleteOne({ _id: po._id }).catch(() => {});
      if (opportunityId) await Opportunity.deleteOne({ _id: opportunityId }).catch(() => {});
      throw err;
    }
  } catch (error) {
    console.error("[opportunities] crearPracticaAutogestionada:", error);
    res.status(500).json({ message: error.message || "Error al registrar práctica autogestionada" });
  }
};

async function getAdminProgramScope(req) {
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

function opportunityMatchesAdminProgram(opportunity, programTerms) {
  if (!programTerms?.length) return false;
  const oppPrograms = (opportunity?.formacionAcademica || [])
    .map((f) => String(f?.program || "").trim().toLowerCase())
    .filter(Boolean);
  if (!oppPrograms.length) return false;
  return programTerms.some((term) => {
    const t = String(term).trim().toLowerCase();
    return t && oppPrograms.some((p) => p.includes(t) || t.includes(p));
  });
}

// Obtener todas las oportunidades
export const getOpportunities = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      estado,
      tipo,
      tipoOportunidad,
      company,
      empresa,
      search,
      fechaVencimiento,
      numeroOportunidad,
      nombreCargo,
      fechaCierreDesde,
      fechaCierreHasta,
      formacionAcademica,
      estadosRevision,
      requisitos,
      empresaConfidenciales,
      sortField = 'fechaCreacion',
      sortDirection = 'desc'
    } = req.query;

    const filter = {};
    const adminScope = await getAdminProgramScope(req);
    if (adminScope && adminScope.programTerms.length === 0) {
      return res.json({ opportunities: [], totalPages: 0, currentPage: parseInt(page), total: 0 });
    }

    // Tipo
    if (tipo) filter.tipo = String(tipo).trim();
    if (tipoOportunidad) filter.tipo = String(tipoOportunidad).trim();

    // Empresa: ObjectId directo o búsqueda por razón social / nombre comercial (normalizada)
    const empresaTrim = empresa != null ? String(empresa).trim() : "";
    if (company && mongoose.Types.ObjectId.isValid(String(company))) {
      filter.company = new mongoose.Types.ObjectId(String(company));
    } else if (empresaTrim) {
      if (mongoose.Types.ObjectId.isValid(empresaTrim) && empresaTrim.length === 24) {
        filter.company = new mongoose.Types.ObjectId(empresaTrim);
      } else {
        const rx = buildSearchRegex(empresaTrim);
        const companyDocs = await Company.find({
          $or: [{ name: rx }, { commercialName: rx }, { legalName: rx }],
        })
          .select("_id")
          .lean();
        const ids = companyDocs.map((c) => c._id);
        if (ids.length === 0) {
          return res.json({
            opportunities: [],
            totalPages: 0,
            currentPage: parseInt(page),
            total: 0,
          });
        }
        filter.company = { $in: ids };
      }
    }

    // Número / fragmento del ID (coincide con cualquier subcadena del ObjectId en hex)
    const numTrim = numeroOportunidad != null ? String(numeroOportunidad).trim().toLowerCase() : "";
    if (numTrim) {
      const allIds = await Opportunity.find({}).select("_id").lean();
      const matchingIds = allIds
        .filter((opp) => opp._id.toString().toLowerCase().includes(numTrim))
        .map((opp) => opp._id);
      if (matchingIds.length === 0) {
        return res.json({
          opportunities: [],
          totalPages: 0,
          currentPage: parseInt(page),
          total: 0,
        });
      }
      filter._id = { $in: matchingIds };
    }

    // Nombre de cargo (insensible a acentos / mayúsculas)
    const nombreCargoTrim = nombreCargo != null ? String(nombreCargo).trim() : "";
    if (nombreCargoTrim) {
      filter.nombreCargo = buildSearchRegex(nombreCargoTrim);
    }

    // Fechas de cierre (incluye todo el día "hasta")
    if (fechaCierreDesde || fechaCierreHasta) {
      filter.fechaVencimiento = {};
      if (fechaCierreDesde) {
        const d = new Date(fechaCierreDesde);
        d.setHours(0, 0, 0, 0);
        filter.fechaVencimiento.$gte = d;
      }
      if (fechaCierreHasta) {
        const d = new Date(fechaCierreHasta);
        d.setHours(23, 59, 59, 999);
        filter.fechaVencimiento.$lte = d;
      }
    } else if (fechaVencimiento) {
      filter.fechaVencimiento = { $lte: new Date(fechaVencimiento) };
    }

    // Formación académica (programa)
    const formacionTrim = formacionAcademica != null ? String(formacionAcademica).trim() : "";
    if (formacionTrim) {
      filter["formacionAcademica.program"] = buildSearchRegex(formacionTrim);
    }
    if (adminScope?.programTerms?.length) {
      const adminProgramClause = {
        $or: adminScope.programTerms.map((term) => ({
          "formacionAcademica.program": { $regex: escapeRegex(term), $options: "i" },
        })),
      };
      filter.$and = [...(filter.$and || []), adminProgramClause];
    }

    // Estado: un solo campo en el modelo; prioriza "estado" sobre "estadosRevision" si vienen ambos
    const estadoTrim = estado != null && String(estado).trim() !== "" ? String(estado).trim() : null;
    const estadoRevTrim =
      estadosRevision != null && String(estadosRevision).trim() !== "" ? String(estadosRevision).trim() : null;
    if (estadoTrim) {
      filter.estado = estadoTrim;
    } else if (estadoRevTrim) {
      filter.estado = estadoRevTrim;
    }

    // Requisitos
    const requisitosTrim = requisitos != null ? String(requisitos).trim() : "";
    if (requisitosTrim) {
      filter.requisitos = buildSearchRegex(requisitosTrim);
    }

    // Solo oportunidades marcadas como confidenciales
    if (String(empresaConfidenciales) === "true" || empresaConfidenciales === true) {
      filter.requiereConfidencialidad = true;
    }

    // Búsqueda libre (compatibilidad API): varios campos con normalización
    const searchTrim = search != null ? String(search).trim() : "";
    if (searchTrim) {
      const rx = buildSearchRegex(searchTrim);
      filter.$or = [{ nombreCargo: rx }, { funciones: rx }, { requisitos: rx }];
    }

    // Ordenamiento
    const sortOptions = {};
    const sortFieldMap = {
      fechaCreacion: "createdAt",
      nombreCargo: "nombreCargo",
      fechaVencimiento: "fechaVencimiento",
      estado: "estado",
    };
    const actualSortField = sortFieldMap[sortField] || "createdAt";
    sortOptions[actualSortField] = sortDirection === 'asc' ? 1 : -1;

    const opportunities = await Opportunity.find(filter)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("tipoVinculacion", "value description listId")
      .populate("postulaciones.estudiante", "studentId faculty program")
      .populate("revisadoPor", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort(sortOptions);

    const total = await Opportunity.countDocuments(filter);

    // Conteo de aplicaciones: postulaciones embebidas + PostulacionOportunidad
    const opportunityIds = opportunities.map((o) => o._id);
    const countsFromPO = await PostulacionOportunidad.aggregate([
      { $match: { opportunity: { $in: opportunityIds } } },
      { $group: { _id: "$opportunity", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(countsFromPO.map((c) => [c._id.toString(), c.count]));
    const opportunitiesWithCount = opportunities.map((opp) => {
      const legacy = opp.postulaciones?.length || 0;
      const fromPO = countMap.get(opp._id.toString()) || 0;
      return { ...opp.toObject(), aplicacionesCount: legacy + fromPO };
    });

    res.json({
      opportunities: opportunitiesWithCount,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /opportunities/para-estudiante-practicas
 * Ofertas de práctica que el estudiante autenticado puede ver:
 * 1) Está en estudiantes_habilitados con estadoFinal "AUTORIZADO"
 * 2) La oportunidad está Activa y en el mismo periodo que el del estudiante autorizado
 * 3) El programa por el que está habilitado está en formacionAcademica de la oportunidad
 * 4) Ese programa está aprobado en aprobacionesPorPrograma de la oportunidad (estado "aprobado")
 */
export const getOfertasParaEstudiantePracticas = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const postulantDoc = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    const postulantId = postulantDoc?._id ?? null;
    const filterAutorizado = {
      estadoFinal: "AUTORIZADO",
      $or: [{ user: userId }],
    };
    if (postulantId) {
      filterAutorizado.$or.push({ postulant: postulantId });
    }

    const autorizados = await EstudianteHabilitado.find(filterAutorizado)
      .populate("periodo", "codigo")
      .populate({ path: "programaFacultad", select: "programId code", populate: { path: "programId", select: "name code" } })
      .lean();

    if (!autorizados.length) {
      return res.json({
        opportunities: [],
        totalPages: 0,
        currentPage: page,
        total: 0,
      });
    }

    // Oportunidad.periodo es ObjectId; usar solo IDs para el filtro (resolver códigos si hace falta)
    const OBJECTID_REGEX = /^[a-f0-9]{24}$/i;
    const periodIdsFromAuth = [...new Set(autorizados.map((a) => a.periodo?._id?.toString()).filter(Boolean))];
    const periodCodes = [...new Set(autorizados.map((a) => a.periodo?.codigo).filter(Boolean))];
    const periodIdsResolved = [...periodIdsFromAuth];
    if (periodCodes.length) {
      const periodosByCode = await Periodo.find({ codigo: { $in: periodCodes } }).select("_id").lean();
      periodosByCode.forEach((p) => {
        if (p._id) periodIdsResolved.push(p._id.toString());
      });
    }
    const periodObjectIds = [...new Set(periodIdsResolved)].filter((id) => OBJECTID_REGEX.test(id)).map((id) => new mongoose.Types.ObjectId(id));

    const programTerms = new Set();
    autorizados.forEach((a) => {
      const pf = a.programaFacultad;
      if (pf?.programId) {
        if (pf.programId.name) programTerms.add(pf.programId.name.trim());
        if (pf.programId.code) programTerms.add(pf.programId.code.trim());
      }
      if (pf?.code) programTerms.add(pf.code.trim());
      // Nombre del programa tal como viene en estudiantes_habilitados
      if (a.nombrePrograma) programTerms.add(a.nombrePrograma.trim());
    });
    const programTermsList = [...programTerms].filter(Boolean);
    if (!periodObjectIds.length || !programTermsList.length) {
      return res.json({
        opportunities: [],
        totalPages: 0,
        currentPage: page,
        total: 0,
      });
    }

    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = {
      tipo: "practica",
      estado: "Activa",
      periodo: { $in: periodObjectIds },
      $or: programTermsList.map((term) => ({
        "formacionAcademica.program": { $regex: escapeRegex(term), $options: "i" },
      })),
      // Que el programa del estudiante esté aprobado en la oportunidad
      aprobacionesPorPrograma: {
        $elemMatch: {
          estado: "aprobado",
          $or: programTermsList.map((term) => ({
            "programa.program": { $regex: escapeRegex(term), $options: "i" },
          })),
        },
      },
    };

    const allCandidates = await Opportunity.find(filter)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .sort({ fechaCreacion: -1 })
      .lean();

    // Filtrar por promedio mínimo: si la oportunidad tiene promedioMinimoRequerido,
    // el estudiante debe tener promedioacumulado >= ese valor (datosAcademicos de su autorización)
    const parseNum = (v) => {
      if (v == null || v === "") return NaN;
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    };
    let opportunitiesFiltered = allCandidates.filter((opp) => {
      const minPromedio = parseNum(opp.promedioMinimoRequerido);
      if (Number.isNaN(minPromedio)) return true; // sin requisito de promedio, se muestra

      const oppPeriodo = opp.periodo ? String(opp.periodo).trim() : "";
      const oppPrograms = (opp.formacionAcademica || []).map((f) => (f.program || "").trim().toLowerCase()).filter(Boolean);
      const matchingAuth = autorizados.find((a) => {
        const periodMatch =
          oppPeriodo === (a.periodo?._id?.toString?.() || "") || oppPeriodo === (a.periodo?.codigo || "");
        if (!periodMatch) return false;
        const prog = (a.nombrePrograma || "").trim().toLowerCase();
        const code = (a.programaFacultad?.programId?.code || "").trim().toLowerCase();
        const name = (a.programaFacultad?.programId?.name || "").trim().toLowerCase();
        return oppPrograms.some(
          (p) =>
            p && (prog.includes(p) || p.includes(prog) || code.includes(p) || p.includes(code) || name.includes(p) || p.includes(name))
        );
      });
      if (!matchingAuth) return true; // no hay autorización que matchee, se incluye (no debería pasar)
      const studentPromedio = parseNum(matchingAuth.datosAcademicos?.promedioacumulado);
      if (Number.isNaN(studentPromedio)) return true; // sin promedio del estudiante, se muestra
      return studentPromedio >= minPromedio;
    });

    // Excluir solo las ofertas a las que ya aplicó (comparación estricta por _id de oportunidad)
    if (postulantId) {
      const postulacionesYa = await PostulacionOportunidad.find({ postulant: postulantId })
        .select("opportunity")
        .lean();
      const idsAplicados = new Set();
      for (const p of postulacionesYa) {
        if (p.opportunity == null) continue;
        const idStr = String(p.opportunity).trim();
        if (idStr.length === 24) idsAplicados.add(idStr);
      }
      if (idsAplicados.size > 0) {
        opportunitiesFiltered = opportunitiesFiltered.filter((opp) => {
          const oppId = opp._id != null ? String(opp._id).trim() : "";
          return oppId.length !== 24 || !idsAplicados.has(oppId);
        });
      }
    }

    const total = opportunitiesFiltered.length;
    const opportunities = opportunitiesFiltered.slice(skip, skip + limit);

    res.json({
      opportunities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Error al listar ofertas para prácticas", error: error.message });
  }
};

// Obtener oportunidad por ID
export const getOpportunityById = async (req, res) => {
  try {
    const adminScope = await getAdminProgramScope(req);
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("company", "name commercialName sector logo contact")
      .populate("periodo", "codigo tipo estado")
      .populate("pais", "name sortname isoAlpha2")
      .populate("ciudad", "name codDian")
      .populate("dedicacion", "value description listId")
      .populate("tipoVinculacion", "value description listId")
      .populate("areaDesempeno", "value description listId")
      .populate("salarioEmocional", "value description listId")
      .populate("creadoPor", "name email")
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email")
      .populate("revisadoPor", "name email")
      .populate("activadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("aprobacionesPorPrograma.aprobadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email")
      .populate({
        path: "cierrePostulantesSeleccionados",
        populate: { path: "postulant", select: "postulantId", populate: { path: "postulantId", select: "name email" } },
      });

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }
    if (adminScope && !opportunityMatchesAdminProgram(opportunity, adminScope.programTerms)) {
      return res.status(403).json({ message: "No autorizado para ver esta oportunidad." });
    }

    const payload = opportunity.toObject ? opportunity.toObject() : { ...opportunity };
    // Si dedicacion viene como string (legacy), resolver a Item para que el front reciba objeto
    if (payload.dedicacion && typeof payload.dedicacion === "string") {
      const doc = await Item.findOne({
        listId: LIST_ID_DEDICATION_JOB_OFFER,
        $or: [
          { value: new RegExp(`^${escapeRegex(payload.dedicacion.trim())}$`, "i") },
          { description: new RegExp(`^${escapeRegex(payload.dedicacion.trim())}$`, "i") }
        ]
      }).select("_id value description").lean();
      if (doc) payload.dedicacion = doc;
    }
    // Si tipoVinculacion viene como string (legacy), resolver a Item
    if (payload.tipoVinculacion && typeof payload.tipoVinculacion === "string") {
      const doc = await Item.findOne({
        listId: LIST_ID_CONTRACT_TYPE_ACADEMIC_PRACTICE,
        $or: [
          { value: new RegExp(`^${escapeRegex(payload.tipoVinculacion.trim())}$`, "i") },
          { description: new RegExp(`^${escapeRegex(payload.tipoVinculacion.trim())}$`, "i") }
        ]
      }).select("_id value description").lean();
      if (doc) payload.tipoVinculacion = doc;
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nueva oportunidad
export const createOpportunity = async (req, res) => {
  try {
    // Manejar FormData: los datos vienen en req.body.data como string JSON
    let opportunityData = {};
    
    if (req.body.data) {
      // Si viene como FormData
      opportunityData = typeof req.body.data === 'string' 
        ? JSON.parse(req.body.data) 
        : req.body.data;
    } else {
      // Si viene como JSON directo
      opportunityData = req.body;
    }

    const { company, ...restData } = opportunityData;

    // Verificar que la empresa existe
    const companyExists = await Company.findById(company);
    if (!companyExists) {
      return res.status(400).json({ message: "Empresa no encontrada" });
    }

    if (String(restData.tipo || "").toLowerCase() === "practica") {
      restData.jornadaSemanalPractica = null;
      const maxH = await getMaxJornadaOrdinariaSemanal();
      const n = validateJornadaPractica(restData);
      if (n != null && n > maxH) {
        return res.status(400).json({
          message: `La jornada ordinaria semanal no puede superar ${maxH} horas (regla de negocio).`,
        });
      }
      if (restData.auxilioEconomico === true) {
        const minAp = await getMinApoyoEconomicoCop();
        const ap = parseInt(String(restData.apoyoEconomico ?? "").replace(/\D/g, ""), 10);
        if (!Number.isFinite(ap) || ap < minAp) {
          return res.status(400).json({
            message: `Con auxilio económico activo, el apoyo debe ser al menos $${minAp.toLocaleString("es-CO")} COP (mínimo configurado en reglas de negocio).`,
          });
        }
      }
    }

    // Validar campos requeridos
    if (!restData.nombreCargo) {
      return res.status(400).json({ message: "El nombre del cargo es requerido" });
    }

    if (!restData.requisitos) {
      return res.status(400).json({ message: "Los requisitos son requeridos" });
    }

    if (restData.funciones && restData.funciones.length < 60) {
      return res.status(400).json({ 
        message: "Las funciones deben tener al menos 60 caracteres" 
      });
    }

    await normalizeOpportunityRefs(restData);

    // Procesar documentos si vienen en FormData
    const documentos = [];
    if (req.files) {
      // Procesar archivos subidos
      let index = 1;
      while (req.files[`documento${index}`]) {
        const file = req.files[`documento${index}`][0] || req.files[`documento${index}`];
        const nombre = req.body[`documento${index}_nombre`] || file.originalname;
        const requerido = req.body[`documento${index}_requerido`] === 'true';
        const orden = parseInt(req.body[`documento${index}_orden`]) || index;

        documentos.push({
          nombre,
          archivo: {
            originalName: file.originalname,
            fileName: file.filename,
            path: file.path,
            size: file.size,
            mimeType: file.mimetype
          },
          requerido,
          orden
        });
        index++;
      }
    }

    // Crear la oportunidad con estado "Creada"
    const opportunity = await Opportunity.create({
      ...restData,
      company,
      documentos: documentos.length > 0 ? documentos : undefined,
      estado: "Creada",
      creadoPor: req.user.id,
      fechaCreacion: new Date(),
      historialEstados: [{
        estadoAnterior: null,
        estadoNuevo: "Creada",
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        comentarios: "Oportunidad creada"
      }]
    });

    await opportunity.populate("company", "name commercialName sector logo address phone city country");
    await opportunity.populate("creadoPor", "name email");
    await opportunity.populate("tipoVinculacion", "value description listId");
    await opportunity.populate("periodo", "codigo tipo estado");
    await opportunity.populate("historialEstados.cambiadoPor", "name email");

    if (String(opportunity.tipo || "").toLowerCase() === "practica") {
      try {
        const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
        const link = `${String(baseUrl).replace(/\/$/, "")}/#/`;
        const tv = opportunity.tipoVinculacion;
        const modalidad =
          tv && typeof tv === "object"
            ? String(tv.description || tv.value || "").trim()
            : "";
        const programasAprobaciones = Array.isArray(opportunity.aprobacionesPorPrograma)
          ? opportunity.aprobacionesPorPrograma
              .map((ap) => {
                const level = String(ap?.programa?.level || "").trim();
                const program = String(ap?.programa?.program || "").trim();
                if (level && program) return `${level} - ${program}`;
                return program || level || "";
              })
              .filter(Boolean)
          : [];
        const programasFormacion = Array.isArray(opportunity.formacionAcademica)
          ? opportunity.formacionAcademica
              .map((f) => {
                const level = String(f?.level || "").trim();
                const program = String(f?.program || "").trim();
                if (level && program) return `${level} - ${program}`;
                return program || level || "";
              })
              .filter(Boolean)
          : [];
        const programas = [...new Set([...(programasAprobaciones || []), ...(programasFormacion || [])])];
        const direccionEntidad = String(opportunity.company?.address || "").trim();
        const telefonoEntidad = String(opportunity.company?.phone || "").trim();
        const datos = {
          NOMBRE_OPORTUNIDAD: opportunity.nombreCargo || "",
          TIPO_OPORTUNIDAD: "Práctica profesional",
          MODALIDAD_VINCULACION: modalidad,
          FUNCIONES: String(opportunity.funciones || "").trim(),
          PROGRAMA: programas.join(", "),
          PERIODO: opportunity.periodo?.codigo != null ? String(opportunity.periodo.codigo) : "",
          LINK: link,
          DIRECCION: direccionEntidad,
          TELEFONO: telefonoEntidad,
          NOMBRE_ENTIDAD:
            opportunity.company?.commercialName || opportunity.company?.name || "",
        };
        const creadorEmail = opportunity.creadoPor?.email;
        await dispatchNotificationByEvent({
          eventValue: "creacion_oportunidad",
          tipo: "practica",
          datos,
          recipientContext: {
            lider_practica: creadorEmail,
            coordinador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR),
            administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
          },
          metadata: { opportunityId: String(opportunity._id) },
        });
      } catch (notifyErr) {
        console.error("[opportunities] creacion_oportunidad notificación:", notifyErr?.message || notifyErr);
      }
    }

    res.status(201).json({
      message: "Oportunidad creada correctamente",
      opportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar oportunidad
export const updateOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validar que la oportunidad existe
    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Validar funciones si se actualizan
    if (updateData.funciones && updateData.funciones.length < 60) {
      return res.status(400).json({ 
        message: "Las funciones deben tener al menos 60 caracteres" 
      });
    }

    if (String(opportunity.tipo || "").toLowerCase() === "practica") {
      updateData.jornadaSemanalPractica = null;
      const maxH = await getMaxJornadaOrdinariaSemanal();
      const jo = updateData.jornadaOrdinariaSemanal;
      if (jo != null && jo !== "") {
        const n = parseInt(jo, 10);
        if (!Number.isNaN(n) && n > maxH) {
          return res.status(400).json({
            message: `La jornada ordinaria semanal no puede superar ${maxH} horas (regla de negocio).`,
          });
        }
      }
      const auxOn =
        updateData.auxilioEconomico !== undefined
          ? updateData.auxilioEconomico === true
          : opportunity.auxilioEconomico === true;
      if (auxOn) {
        const minAp = await getMinApoyoEconomicoCop();
        const rawAp =
          updateData.apoyoEconomico !== undefined && updateData.apoyoEconomico !== null
            ? updateData.apoyoEconomico
            : opportunity.apoyoEconomico;
        const ap = parseInt(String(rawAp ?? "").replace(/\D/g, ""), 10);
        if (!Number.isFinite(ap) || ap < minAp) {
          return res.status(400).json({
            message: `Con auxilio económico activo, el apoyo debe ser al menos $${minAp.toLocaleString("es-CO")} COP (mínimo configurado en reglas de negocio).`,
          });
        }
      }
    }

    // No permitir cambiar el estado ni el historial desde el body
    if (updateData.estado) delete updateData.estado;
    if (updateData.historialEstados) delete updateData.historialEstados;

    await normalizeOpportunityRefs(updateData);

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("tipoVinculacion", "value description listId");

    // Registrar edición en historial de estados (mismo estado = edición)
    if (updatedOpportunity) {
      const historialEntry = {
        estadoAnterior: opportunity.estado,
        estadoNuevo: opportunity.estado,
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        comentarios: "Oportunidad editada"
      };
      updatedOpportunity.historialEstados.push(historialEntry);
      await updatedOpportunity.save();
    }

    const finalOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("tipoVinculacion", "value description listId")
      .populate("historialEstados.cambiadoPor", "name email");

    res.json({
      message: "Oportunidad actualizada correctamente",
      opportunity: finalOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cambiar estado de la oportunidad
export const changeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentarios } = req.body;

    const validStates = [
      "Creada",
      "En Revisión",
      "Revisada",
      "Activa",
      "Rechazada",
      "Cerrada",
      "Vencida"
    ];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ 
        message: `Estado inválido. Estados válidos: ${validStates.join(", ")}` 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const estadoAnterior = opportunity.estado;

    // Actualizar estado y usuario correspondiente
    const updateData = {
      estado,
      comentariosRevision: comentarios || null
    };

    switch (estado) {
      case "En Revisión":
        updateData.revisadoPor = req.user.id;
        break;
      case "Activa":
        updateData.activadoPor = req.user.id;
        break;
      case "Rechazada":
        updateData.rechazadoPor = req.user.id;
        break;
    }

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Registrar en historial si cambió el estado
    if (estadoAnterior !== estado && updatedOpportunity) {
      const historialEntry = {
        estadoAnterior,
        estadoNuevo: estado,
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        comentarios: comentarios || null
      };
      
      updatedOpportunity.historialEstados.push(historialEntry);
      await updatedOpportunity.save();
    }

    const finalOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("revisadoPor", "name email")
      .populate("activadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email");

    if (estadoAnterior !== estado) {
      try {
        const tipoPr = String(finalOpportunity?.tipo || "").toLowerCase();
        if (tipoPr === "practica") {
          const link = practicaOpportunityDashboardLink(finalOpportunity?._id || id);
          const isActivaORechazada = estado === "Activa" || estado === "Rechazada";
          const eventValue = isActivaORechazada
            ? "activacion_rechazo_oportunidad"
            : "actualizacion_estado_oportunidad";
          const creador = finalOpportunity?.creadoPor?.email;
          await dispatchNotificationByEvent({
            eventValue,
            tipo: "practica",
            datos: {
              NOMBRE_OPORTUNIDAD: finalOpportunity?.nombreCargo || "",
              ESTADO_OPORTUNIDAD: estado || "",
              OBSERVACION: comentarios || "",
              LINK: link,
            },
            recipientContext: {
              ...entityAndCoordinatorsRecipientContext(creador),
              lider_practica: [
                creador,
                finalOpportunity?.revisadoPor?.email,
                finalOpportunity?.activadoPor?.email,
                finalOpportunity?.rechazadoPor?.email,
              ].filter(Boolean),
            },
            metadata: { opportunityId: String(finalOpportunity?._id || id) },
          });
        }
      } catch (notifyErr) {
        console.error("[opportunities] cambio estado oportunidad notificación:", notifyErr?.message || notifyErr);
      }
    }

    res.json({
      message: `Estado cambiado a "${estado}" correctamente`,
      opportunity: finalOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** POST /opportunities/:id/close — Cerrar oportunidad (solo si está Activa). Body: contrató (boolean), motivoNoContrato? (string), postulantesSeleccionados? ([id]), datosTutor? ([{ postulacionId, nombreTutor, ... }]). */
export const closeOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const { contrató, motivoNoContrato, postulantesSeleccionados, datosTutor } = req.body;
    const contratoBool = contrató === true || contrató === "true" || contrató === 1 || contrató === "1";

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }
    if (opportunity.estado !== "Activa") {
      return res.status(400).json({ message: "Solo se puede cerrar una oportunidad en estado Activa" });
    }

    const seleccionados = Array.isArray(postulantesSeleccionados) ? postulantesSeleccionados : [];
    const tutores = Array.isArray(datosTutor) ? datosTutor : [];

    if (contratoBool) {
      if (seleccionados.length === 0) {
        return res.status(400).json({ message: "Debe seleccionar al menos un postulante cuando la entidad indica que contrató." });
      }

      const postulacionesValidas = await PostulacionOportunidad.find({
        _id: { $in: seleccionados },
        opportunity: id,
      }).select("_id").lean();
      if (postulacionesValidas.length !== seleccionados.length) {
        return res.status(400).json({ message: "Hay postulaciones seleccionadas que no pertenecen a esta oportunidad." });
      }

      const requiredTutorFields = [
        "nombreTutor",
        "apellidoTutor",
        "emailTutor",
        "cargoTutor",
        "tipoIdentTutor",
        "identificacionTutor",
        "arlEmpresa",
        "fechaInicioPractica",
      ];
      const tutorByPostulacion = new Map(
        tutores
          .filter((t) => t?.postulacionId)
          .map((t) => [String(t.postulacionId), t])
      );
      for (const postId of seleccionados.map(String)) {
        const tutor = tutorByPostulacion.get(postId);
        if (!tutor) {
          return res.status(400).json({ message: `Faltan datos del tutor para la postulación ${postId}.` });
        }
        for (const field of requiredTutorFields) {
          const value = tutor[field];
          if (value == null || String(value).trim() === "") {
            return res.status(400).json({ message: `El campo ${field} del tutor es obligatorio para la postulación ${postId}.` });
          }
        }
      }
    }

    const estadoAnterior = opportunity.estado;
    opportunity.estado = "Cerrada";
    opportunity.fechaCierre = new Date();
    opportunity.motivoCierreNoContrato = contratoBool ? null : ((motivoNoContrato || "").toString().trim() || null);
    opportunity.cierrePostulantesSeleccionados = seleccionados;
    opportunity.cierreDatosTutor = contratoBool ? tutores : [];

    if (opportunity.cierrePostulantesSeleccionados.length > 0) {
      await PostulacionOportunidad.updateMany(
        { _id: { $in: opportunity.cierrePostulantesSeleccionados }, opportunity: id },
        { $set: { estado: "seleccionado_empresa", seleccionadoAt: new Date() } }
      );
    }

    opportunity.historialEstados.push({
      estadoAnterior,
      estadoNuevo: "Cerrada",
      cambiadoPor: req.user.id,
      fechaCambio: new Date(),
      comentarios: contratoBool ? "Oportunidad cerrada con postulante(s) seleccionado(s)" : motivoNoContrato,
    });
    await opportunity.save();

    const updated = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("revisadoPor", "name email")
      .populate("activadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email");

    if (String(opportunity.tipo || "").toLowerCase() === "practica" && seleccionados.length > 0) {
      const obs = contratoBool
        ? "Ha sido seleccionado(a) en el cierre de la oportunidad. Revise los siguientes pasos en la plataforma."
        : String(motivoNoContrato || "Cierre de oportunidad.").trim();
      for (const sid of seleccionados) {
        const ctxC = await loadPracticaPostulacionContext(sid);
        if (!ctxC) continue;
        await dispatchPracticaNotification(
          "notificacion_resultados_postulacion_estudiantes",
          { ...ctxC.datos, OBSERVACION: obs },
          studentOnlyRecipientContext(ctxC.postulantEmail),
          { opportunityId: String(id), postulacionId: String(sid), source: "closeOpportunity" }
        );
      }
    }

    res.json({
      message: "Oportunidad cerrada correctamente",
      opportunity: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Rechazar oportunidad con motivo
export const rejectOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivoRechazo, motivoRechazoOtro } = req.body;

    if (!motivoRechazo) {
      return res.status(400).json({ 
        message: "Debe proporcionar un motivo de rechazo" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const estadoAnterior = opportunity.estado;

    // Actualizar oportunidad
    const updateData = {
      estado: "Rechazada",
      rechazadoPor: req.user.id,
      motivoRechazo,
      motivoRechazoOtro: motivoRechazo === "Otro" ? motivoRechazoOtro : null
    };

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Registrar en historial
    if (estadoAnterior !== "Rechazada" && updatedOpportunity) {
      const historialEntry = {
        estadoAnterior,
        estadoNuevo: "Rechazada",
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        motivo: motivoRechazo,
        comentarios: motivoRechazo === "Otro" ? motivoRechazoOtro : motivoRechazo
      };
      
      updatedOpportunity.historialEstados.push(historialEntry);
      await updatedOpportunity.save();
    }

    const finalOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email");

    if (String(finalOpportunity?.tipo || "").toLowerCase() === "practica") {
      try {
        const motivoTxt =
          motivoRechazo === "Otro"
            ? String(motivoRechazoOtro || "").trim()
            : String(motivoRechazo || "").trim();
        await dispatchNotificationByEvent({
          eventValue: "activacion_rechazo_oportunidad",
          tipo: "practica",
          datos: {
            NOMBRE_OPORTUNIDAD: finalOpportunity?.nombreCargo || "",
            ESTADO_OPORTUNIDAD: "Rechazada",
            OBSERVACION: motivoTxt,
            LINK: practicaOpportunityDashboardLink(id),
          },
          recipientContext: {
            ...entityAndCoordinatorsRecipientContext(finalOpportunity?.creadoPor?.email),
            lider_practica: [
              finalOpportunity?.creadoPor?.email,
              finalOpportunity?.rechazadoPor?.email,
            ].filter(Boolean),
          },
          metadata: { opportunityId: String(id), source: "rejectOpportunity" },
        });
      } catch (e) {
        console.error("[opportunities] rejectOpportunity notificación:", e?.message || e);
      }
    }

    res.json({
      message: "Oportunidad rechazada correctamente",
      opportunity: finalOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener historial de estados
export const getStatusHistory = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("historialEstados.cambiadoPor", "name email")
      .select("historialEstados");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json({
      historial: opportunity.historialEstados || []
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Duplicar oportunidad
export const duplicateOpportunity = async (req, res) => {
  try {
    const originalOpportunity = await Opportunity.findById(req.params.id);
    
    if (!originalOpportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Crear nueva oportunidad con los mismos datos pero estado "Creada"
    const opportunityData = originalOpportunity.toObject();
    
    // Eliminar campos que no deben duplicarse
    delete opportunityData._id;
    delete opportunityData.createdAt;
    delete opportunityData.updatedAt;
    delete opportunityData.postulaciones;
    delete opportunityData.historialEstados;
    delete opportunityData.aprobacionesPorPrograma;
    delete opportunityData.revisadoPor;
    delete opportunityData.activadoPor;
    delete opportunityData.rechazadoPor;
    delete opportunityData.fechaRevision;
    delete opportunityData.fechaActivacion;
    delete opportunityData.fechaCierre;
    delete opportunityData.fechaVencimientoEstado;
    delete opportunityData.comentariosRevision;
    delete opportunityData.motivoRechazo;
    delete opportunityData.motivoRechazoOtro;

    // Establecer estado inicial e historial como "Creada" (igual que crear de cero)
    opportunityData.estado = "Creada";
    opportunityData.creadoPor = req.user.id;
    opportunityData.fechaCreacion = new Date();
    opportunityData.historialEstados = [{
      estadoAnterior: null,
      estadoNuevo: "Creada",
      cambiadoPor: req.user.id,
      fechaCambio: new Date(),
      comentarios: "Oportunidad creada"
    }];

    await normalizeOpportunityRefs(opportunityData);

    const newOpportunity = await Opportunity.create(opportunityData);

    await newOpportunity.populate("company", "name commercialName sector logo");
    await newOpportunity.populate("creadoPor", "name email");
    await newOpportunity.populate("historialEstados.cambiadoPor", "name email");

    res.status(201).json({
      message: "Oportunidad duplicada correctamente",
      opportunity: newOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar oportunidad
export const deleteOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findByIdAndDelete(req.params.id);

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json({ message: "Oportunidad eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Postularse a oportunidad
export const applyToOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentos } = req.body;

    // Verificar que la oportunidad existe
    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que esté activa
    if (opportunity.estado !== "Activa") {
      return res.status(400).json({ 
        message: "La oportunidad no está disponible para postulaciones" 
      });
    }

    // Verificar que no haya vencido
    if (opportunity.fechaVencimiento && new Date(opportunity.fechaVencimiento) < new Date()) {
      return res.status(400).json({ 
        message: "La oportunidad ha vencido" 
      });
    }

    // Verificar que el usuario es estudiante
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(400).json({ 
        message: "Solo los estudiantes pueden postularse" 
      });
    }

    // Verificar que no se haya postulado antes
    const existingApplication = opportunity.postulaciones.find(
      app => app.estudiante.toString() === student._id.toString()
    );

    if (existingApplication) {
      return res.status(400).json({ 
        message: "Ya te has postulado a esta oportunidad" 
      });
    }

    // Agregar postulación
    opportunity.postulaciones.push({
      estudiante: student._id,
      fechaPostulacion: new Date(),
      estado: "pendiente",
      documentos: documentos || []
    });

    await opportunity.save();

    const populatedOpportunity = await Opportunity.findById(id)
      .populate("postulaciones.estudiante", "studentId faculty program");

    if (String(opportunity.tipo || "").toLowerCase() === "practica") {
      try {
        const oppPop = await Opportunity.findById(id)
          .populate("company", "name commercialName")
          .populate("creadoPor", "email name")
          .lean();
        const studentPop = await Student.findById(student._id).populate("user", "name email").lean();
        const datos = buildDatosPracticaSimple(oppPop, studentPop?.user);
        await dispatchPracticaNotification(
          "postulacion_estudiantes_entidad_lideres",
          datos,
          entityAndCoordinatorsRecipientContext(oppPop?.creadoPor?.email),
          { opportunityId: String(id), source: "applyToOpportunity_legacy" }
        );
      } catch (e) {
        console.error("[opportunities] postulacion legacy notificación:", e?.message || e);
      }
    }

    res.status(201).json({
      message: "Postulación enviada correctamente",
      postulacion: populatedOpportunity.postulaciones[populatedOpportunity.postulaciones.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * RQ04_HU002: Postulante (estudiante) se postula a una oportunidad con una hoja de vida.
 * POST /opportunities/:id/aplicar — body: { profileId } (PostulantProfile._id), opcional { profileVersionId } (ProfileProfileVersion._id)
 */
export const aplicarOportunidad = async (req, res) => {
  try {
    const { id: opportunityId } = req.params;
    const { profileId, profileVersionId } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    if (!profileId) return res.status(400).json({ message: "Debe seleccionar un perfil (hoja de vida)" });

    const opportunity = await Opportunity.findById(opportunityId).lean();
    if (!opportunity) return res.status(404).json({ message: "Oportunidad no encontrada" });
    if (opportunity.estado !== "Activa") {
      return res.status(400).json({ message: "La oportunidad no está disponible para postulaciones" });
    }
    if (opportunity.fechaVencimiento && new Date(opportunity.fechaVencimiento) < new Date()) {
      return res.status(400).json({ message: "La oportunidad ha vencido" });
    }

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) {
      return res.status(400).json({ message: "No tiene un perfil de postulante asociado" });
    }

    // HU004: si ya tiene una postulación seleccionada por empresa o aceptada por estudiante,
    // se bloquean nuevas postulaciones hasta que rechace/culmine ese proceso.
    const tieneAprobadaVigente = await PostulacionOportunidad.exists({
      postulant: postulant._id,
      estado: { $in: ["seleccionado_empresa", "aceptado_estudiante"] },
    });
    if (tieneAprobadaVigente) {
      return res.status(400).json({
        message:
          "Ya tiene una postulación aprobada/seleccionada por una entidad. Debe responderla antes de postularse a más oportunidades.",
      });
    }

    const PostulantProfile = (await import("../postulants/models/profile/profile.schema.js")).default;
    const profile = await PostulantProfile.findOne({
      _id: profileId,
      $or: [{ postulantId: postulant._id }, { postulantId: userId }],
    }).select("_id").lean();
    if (!profile) {
      return res.status(400).json({ message: "El perfil seleccionado no existe o no le pertenece" });
    }

    let resolvedProfileVersionId = null;
    if (profileVersionId) {
      const { ProfileProfileVersion } = await import("../postulants/models/profile/index.js");
      const version = await ProfileProfileVersion.findOne({
        _id: profileVersionId,
        profileId: profile._id,
      }).select("_id").lean();
      if (!version) {
        return res.status(400).json({ message: "La versión de perfil no existe o no pertenece al perfil seleccionado" });
      }
      resolvedProfileVersionId = version._id;
    }

    const existing = await PostulacionOportunidad.findOne({
      opportunity: opportunityId,
      postulant: postulant._id,
    }).lean();
    if (existing) {
      return res.status(400).json({ message: "Ya se ha postulado a esta oportunidad" });
    }

    const postulacion = await PostulacionOportunidad.create({
      postulant: postulant._id,
      opportunity: opportunityId,
      postulantProfile: profileId,
      profileVersionId: resolvedProfileVersionId || undefined,
      estado: "aplicado",
    });

    const populated = await PostulacionOportunidad.findById(postulacion._id)
      .populate("opportunity", "nombreCargo company estado")
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode");

    if (String(opportunity.tipo || "").toLowerCase() === "practica") {
      const ctx = await loadPracticaPostulacionContext(postulacion._id);
      if (ctx) {
        await dispatchPracticaNotification(
          "postulacion_estudiantes_entidad_lideres",
          ctx.datos,
          entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
          { postulacionId: String(postulacion._id), opportunityId: String(opportunityId) }
        );
      }
    }

    res.status(201).json({
      message: "Postulación enviada correctamente",
      postulacion: populated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /opportunities/mis-postulaciones — Lista las postulaciones del estudiante (postulante) actual.
 */
export const getMisPostulaciones = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) {
      return res.json({ data: [], total: 0 });
    }

    const list = await PostulacionOportunidad.find({ postulant: postulant._id })
      .populate({
        path: "opportunity",
        select: "nombreCargo company periodo fechaVencimiento estado",
        populate: { path: "company", select: "name commercialName" },
      })
      .populate("postulantProfile", "studentCode")
      .sort({ fechaAplicacion: -1 })
      .lean();

    const tieneAceptadaDefinitiva = list.some((p) => p.estado === "aceptado_estudiante");

    const data = list.map((p) => {
      const opp = p.opportunity;
      const company = opp?.company;
      return {
        _id: p._id,
        cargo: opp?.nombreCargo,
        empresa: company?.name || company?.commercialName,
        fechaAplicacion: p.fechaAplicacion,
        estadoOportunidad: opp?.estado,
        estado: p.estado,
        empresaConsultoPerfil: !!p.empresaConsultoPerfilAt,
        empresaDescargoHv: !!p.empresaDescargoHvAt,
        seleccionadoPorEmpresa: p.estado === "seleccionado_empresa" || p.estado === "aceptado_estudiante",
        aceptadoPorEstudiante: p.estado === "aceptado_estudiante",
        puedeAceptarDefinitivo: p.estado === "seleccionado_empresa" && !tieneAceptadaDefinitiva,
        tieneAceptadaDefinitivaGlobal: tieneAceptadaDefinitiva,
        linkOportunidad: opp?._id ? `/dashboard/oportunidades-practica` : null,
        opportunityId: opp?._id,
      };
    });

    res.json({ data, total: data.length, tieneAceptadaDefinitivaGlobal: tieneAceptadaDefinitiva });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /opportunities/:id/applications/:postulacionId/estudiante-responder
 * El estudiante (postulante) confirma o rechaza la selección. Body: { accion: 'confirmar' | 'rechazar' }
 * Actualiza estado (aceptado_estudiante/rechazado) y aceptadoEstudianteAt/rechazadoAt.
 */
export const estudianteResponderPostulacion = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    const { id: opportunityId, postulacionId } = req.params;
    const { accion } = req.body || {};
    if (!accion || !["confirmar", "rechazar"].includes(accion)) {
      return res.status(400).json({ message: "accion debe ser 'confirmar' o 'rechazar'" });
    }

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.status(403).json({ message: "No es postulante" });

    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
      postulant: postulant._id,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    if (po.estado !== "seleccionado_empresa") {
      return res.status(400).json({ message: "Solo puede responder cuando fue seleccionado por la empresa" });
    }

    const now = new Date();
    let otrasPostulacionIds = [];
    if (accion === "confirmar") {
      const yaTieneAceptada = await PostulacionOportunidad.exists({
        postulant: postulant._id,
        estado: "aceptado_estudiante",
        _id: { $ne: po._id },
      });
      if (yaTieneAceptada) {
        return res.status(400).json({
          message: "Ya confirmó otra oportunidad. Solo puede aceptar una entidad definitivamente.",
        });
      }
      const otrosDocs = await findOtrasPostulacionesActivas(postulant._id, po._id);
      otrasPostulacionIds = otrosDocs.map((d) => d._id);

      po.estado = "aceptado_estudiante";
      po.aceptadoEstudianteAt = now;
      po.rechazadoAt = null;
      po.comentarios = "Aceptada definitivamente por el estudiante";

      // HU004: al aceptar una, las demás postulaciones del estudiante pasan a no disponible (rechazadas).
      await PostulacionOportunidad.updateMany(
        {
          postulant: postulant._id,
          _id: { $ne: po._id },
          estado: { $in: ["aplicado", "empresa_consulto_perfil", "empresa_descargo_hv", "seleccionado_empresa"] },
        },
        {
          $set: {
            estado: "rechazado",
            rechazadoAt: now,
            comentarios: "No continúa el proceso: el estudiante aceptó otra oportunidad de forma definitiva",
            aceptadoEstudianteAt: null,
          },
        }
      );
    } else {
      po.estado = "rechazado";
      po.rechazadoAt = now;
      po.aceptadoEstudianteAt = null;
      po.comentarios = "Rechazada por el estudiante";
    }
    await po.save();

    const oppTipoCheck = await Opportunity.findById(opportunityId).select("tipo").lean();
    if (String(oppTipoCheck?.tipo || "").toLowerCase() === "practica") {
      if (accion === "confirmar") {
        const ctx = await loadPracticaPostulacionContext(po._id);
        if (ctx) {
          await dispatchPracticaNotification(
            "aceptacion_inscripcion_oportunidad_estudiantes",
            { ...ctx.datos },
            studentOnlyRecipientContext(ctx.postulantEmail),
            { postulacionId: String(po._id), opportunityId: String(opportunityId) }
          );
          await dispatchPracticaNotification(
            "actualizacion_estado_oportunidad_aceptacion_rechazo_entidad",
            {
              ...ctx.datos,
              ESTADO_OPORTUNIDAD: "Aceptado por el estudiante",
              COMENTARIO: po.comentarios || "",
            },
            entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
            { postulacionId: String(po._id), opportunityId: String(opportunityId) }
          );
        }
        for (const oid of otrasPostulacionIds) {
          const ctxO = await loadPracticaPostulacionContext(oid);
          if (!ctxO) continue;
          await dispatchPracticaNotification(
            "notificacion_entidad_estudiante_no_continua",
            {
              ...ctxO.datos,
              OBSERVACION:
                "El estudiante aceptó de forma definitiva otra oportunidad. Esta postulación quedó sin continuidad.",
            },
            entityAndCoordinatorsRecipientContext(ctxO.creadorEmail),
            { postulacionId: String(oid), opportunityId: String(ctxO.po.opportunity) }
          );
        }
      } else {
        const ctx = await loadPracticaPostulacionContext(po._id);
        if (ctx) {
          await dispatchPracticaNotification(
            "actualizacion_estado_oportunidad_aceptacion_rechazo_entidad",
            {
              ...ctx.datos,
              ESTADO_OPORTUNIDAD: "Rechazado por el estudiante",
              COMENTARIO: po.comentarios || "",
            },
            entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
            { postulacionId: String(po._id), opportunityId: String(opportunityId) }
          );
        }
      }
    }

    // RQ04_HU006: Si el estudiante confirmó y la oportunidad es tipo "Acuerdo de vinculación", iniciar flujo de generación de acuerdo
    if (accion === "confirmar") {
      await ensureLegalizacionPracticaOnAcceptance(po._id, userId);
    }

    res.json({
      message: accion === "confirmar" ? "Has confirmado la selección" : "Has rechazado la selección",
      estado: po.estado,
      aceptadoEstudianteAt: po.aceptadoEstudianteAt,
      rechazadoAt: po.rechazadoAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /opportunities/:id/applications/:postulacionId/coord-aceptar
 * HU004: aceptación excepcional en nombre del estudiante por coordinación.
 */
export const coordinacionAceptarEnNombreEstudiante = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;

    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    if (po.estado !== "seleccionado_empresa") {
      return res.status(400).json({ message: "Solo se puede aceptar en nombre del estudiante cuando está seleccionada por la empresa" });
    }

    const now = new Date();
    const yaTieneAceptada = await PostulacionOportunidad.exists({
      postulant: po.postulant,
      estado: "aceptado_estudiante",
      _id: { $ne: po._id },
    });
    if (yaTieneAceptada) {
      return res.status(400).json({ message: "El estudiante ya tiene otra oportunidad aceptada definitivamente" });
    }

    const otrosDocs = await findOtrasPostulacionesActivas(po.postulant, po._id);
    const otrasPostulacionIds = otrosDocs.map((d) => d._id);

    po.estado = "aceptado_estudiante";
    po.aceptadoEstudianteAt = now;
    po.rechazadoAt = null;
    po.revisadoPor = req.user?.id || null;
    po.comentarios = "Aceptada en nombre del estudiante por coordinación";
    await po.save();

    await PostulacionOportunidad.updateMany(
      {
        postulant: po.postulant,
        _id: { $ne: po._id },
        estado: { $in: ["aplicado", "empresa_consulto_perfil", "empresa_descargo_hv", "seleccionado_empresa"] },
      },
      {
        $set: {
          estado: "rechazado",
          rechazadoAt: now,
          comentarios: "No continúa el proceso: coordinación confirmó otra oportunidad en nombre del estudiante",
          aceptadoEstudianteAt: null,
        },
      }
    );

    await ensureLegalizacionPracticaOnAcceptance(po._id, req.user?.id || null);

    const oppTipoCoord = await Opportunity.findById(opportunityId).select("tipo").lean();
    if (String(oppTipoCoord?.tipo || "").toLowerCase() === "practica") {
      const ctx = await loadPracticaPostulacionContext(po._id);
      if (ctx) {
        await dispatchPracticaNotification(
          "aceptacion_inscripcion_oportunidad_estudiantes",
          { ...ctx.datos, COMENTARIO: "Aceptación registrada por coordinación en nombre del estudiante." },
          studentOnlyRecipientContext(ctx.postulantEmail),
          { postulacionId: String(po._id), opportunityId: String(opportunityId), source: "coord_aceptar" }
        );
        await dispatchPracticaNotification(
          "actualizacion_estado_oportunidad_aceptacion_rechazo_entidad",
          {
            ...ctx.datos,
            ESTADO_OPORTUNIDAD: "Aceptado (coordinación en nombre del estudiante)",
            COMENTARIO: po.comentarios || "",
          },
          entityAndCoordinatorsRecipientContext(ctx.creadorEmail),
          { postulacionId: String(po._id), opportunityId: String(opportunityId), source: "coord_aceptar" }
        );
      }
      for (const oid of otrasPostulacionIds) {
        const ctxO = await loadPracticaPostulacionContext(oid);
        if (!ctxO) continue;
        await dispatchPracticaNotification(
          "notificacion_entidad_estudiante_no_continua",
          {
            ...ctxO.datos,
            OBSERVACION:
              "Coordinación aceptó en nombre del estudiante otra oportunidad. Esta postulación quedó sin continuidad.",
          },
          entityAndCoordinatorsRecipientContext(ctxO.creadorEmail),
          { postulacionId: String(oid), opportunityId: String(ctxO.po.opportunity), source: "coord_aceptar" }
        );
      }
    }

    res.json({
      message: "Aceptación registrada en nombre del estudiante",
      estado: po.estado,
      aceptadoEstudianteAt: po.aceptadoEstudianteAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener postulaciones de una oportunidad (legacy Student + PostulacionOportunidad de postulantes)
export const getApplications = async (req, res) => {
  try {
    const adminScope = await getAdminProgramScope(req);
    const opportunity = await Opportunity.findById(req.params.id)
      .populate({
        path: "postulaciones.estudiante",
        select: "studentId faculty program user",
        populate: { path: "user", select: "name email" },
      })
      .populate("postulaciones.revisadoPor", "name email");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }
    if (adminScope && !opportunityMatchesAdminProgram(opportunity, adminScope.programTerms)) {
      return res.status(403).json({ message: "No autorizado para ver postulaciones de esta oportunidad." });
    }

    const postulantesList = await PostulacionOportunidad.find({ opportunity: req.params.id })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    const profileIds = postulantesList
      .map((p) => p.postulantProfile?._id)
      .filter(Boolean);

    const [enrolledByProfile, graduateByProfile] = await Promise.all([
      profileIds.length
        ? ProfileEnrolledProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
      profileIds.length
        ? ProfileGraduateProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
    ]);

    const enrolledMap = new Map();
    enrolledByProfile.forEach((e) => {
      if (!e.profileId) return;
      const key = e.profileId.toString();
      if (!enrolledMap.has(key)) enrolledMap.set(key, []);
      enrolledMap.get(key).push(e.programId?.name || e.programId?.level || "—");
    });
    const graduateMap = new Map();
    graduateByProfile.forEach((g) => {
      if (!g.profileId) return;
      const key = g.profileId.toString();
      if (!graduateMap.has(key)) graduateMap.set(key, []);
      graduateMap.get(key).push(g.programId?.name || g.programId?.level || "—");
    });

    const estadoLabel = (est) => {
      const map = {
        aplicado: "Enviado",
        empresa_consulto_perfil: "Revisado",
        empresa_descargo_hv: "HV descargada",
        seleccionado_empresa: "Seleccionado",
        aceptado_estudiante: "Aceptado",
        rechazado: "Rechazado",
      };
      return map[est] || est || "—";
    };

    const allowedProfileIdsSet =
      adminScope?.programIds?.length
        ? new Set(
            [
              ...(await ProfileEnrolledProgram.distinct("profileId", {
                profileId: { $in: profileIds },
                programId: { $in: adminScope.programIds },
              })),
              ...(await ProfileGraduateProgram.distinct("profileId", {
                profileId: { $in: profileIds },
                programId: { $in: adminScope.programIds },
              })),
            ].map((id) => String(id))
          )
        : null;

    const postulacionesLegacy = (opportunity.postulaciones || []).map((p) => {
      const po = p.toObject?.() || p;
      const estudiante = po.estudiante || {};
      const name = estudiante.user?.name || estudiante.name || "";
      const [nombres = "", ...rest] = (name || "").trim().split(/\s+/);
      const apellidos = rest.join(" ") || "—";
      return {
        ...po,
        _source: "legacy",
        tipo: "student",
        nombres: nombres || "—",
        apellidos,
        programasEnCurso: estudiante.program ? [estudiante.program] : [],
        programasFinalizados: [],
        añosExperiencia: null,
        revisada: !!po.revisadoPor,
        descargada: false,
        estadoLabel: "Enviado",
      };
    }).filter((p) => {
      if (!adminScope?.programTerms?.length) return true;
      const programs = (p.programasEnCurso || []).map((x) => String(x).toLowerCase());
      return adminScope.programTerms.some((t) => programs.some((pname) => pname.includes(String(t).toLowerCase())));
    });

    const postulacionesPostulantes = postulantesList.map((p) => {
      const profileId = p.postulantProfile?._id?.toString();
      const name = (p.postulant?.postulantId?.name || p.postulant?.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      const years = p.postulantProfile?.yearsExperience ?? p.postulantProfile?.totalTimeExperience;
      const añosExperiencia =
        years != null ? `${years} Año(s) de experiencia` : null;
      return {
        _id: p._id,
        postulant: p.postulant,
        postulantProfile: p.postulantProfile,
        fechaPostulacion: p.fechaAplicacion,
        estado: p.estado,
        estadoLabel: estadoLabel(p.estado),
        comentarios: p.comentarios,
        revisadoPor: p.revisadoPor,
        fechaRevision: p.updatedAt,
        _source: "postulacion_oportunidad",
        tipo: "postulant",
        nombres: nombres || "—",
        apellidos,
        programasEnCurso: profileId ? enrolledMap.get(profileId) || [] : [],
        programasFinalizados: profileId ? graduateMap.get(profileId) || [] : [],
        añosExperiencia,
        revisada: !!p.empresaConsultoPerfilAt,
        descargada: !!p.empresaDescargoHvAt,
      };
    }).filter((p) => {
      if (!adminScope?.programIds?.length) return true;
      const profileId = p.postulantProfile?._id?.toString();
      return profileId ? allowedProfileIdsSet?.has(profileId) : false;
    });

    res.json({
      postulaciones: [...postulacionesLegacy, ...postulacionesPostulantes],
      total: postulacionesLegacy.length + postulacionesPostulantes.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /opportunities/:id/applications/detail/:postulacionId — Detalle de un postulante (perfil, competencias, CVs). Al entrar se marca empresa_consulto_perfil. */
export const getApplicationDetail = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;
    const adminScope = await getAdminProgramScope(req);
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }
    if (adminScope && !opportunityMatchesAdminProgram(opportunity, adminScope.programTerms)) {
      return res.status(403).json({ message: "No autorizado para ver esta postulación." });
    }

    let po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    if (po) {
      if (adminScope?.programIds?.length) {
        const scopedProfileIdRaw = po.postulantProfile?._id ?? po.postulantProfile;
        const profileIdStr = scopedProfileIdRaw ? String(scopedProfileIdRaw) : "";
        const [enrolledOk, graduateOk] = await Promise.all([
          profileIdStr
            ? ProfileEnrolledProgram.exists({
                profileId: profileIdStr,
                programId: { $in: adminScope.programIds },
              })
            : false,
          profileIdStr
            ? ProfileGraduateProgram.exists({
                profileId: profileIdStr,
                programId: { $in: adminScope.programIds },
              })
            : false,
        ]);
        if (!enrolledOk && !graduateOk) {
          return res.status(403).json({ message: "No autorizado para ver esta postulación." });
        }
      }
      if (po.estado === "aplicado" && !po.empresaConsultoPerfilAt) {
        await PostulacionOportunidad.updateOne(
          { _id: postulacionId },
          {
            $set: {
              estado: "empresa_consulto_perfil",
              empresaConsultoPerfilAt: new Date(),
            },
          }
        );
      }
      // Perfil (y versión) con el que se postuló: solo CVs de ESE perfil/versión
      const profileIdRaw = po.postulantProfile?._id ?? po.postulantProfile;
      const profileId = profileIdRaw
        ? mongoose.Types.ObjectId.isValid(profileIdRaw)
          ? typeof profileIdRaw === "string"
            ? new mongoose.Types.ObjectId(profileIdRaw)
            : profileIdRaw
          : null
        : null;
      const profileVersionIdRaw = po.profileVersionId;
      const profileVersionId = profileVersionIdRaw && mongoose.Types.ObjectId.isValid(profileVersionIdRaw)
        ? (typeof profileVersionIdRaw === "string" ? new mongoose.Types.ObjectId(profileVersionIdRaw) : profileVersionIdRaw)
        : null;
      // Solo la HV con la que aplicó: mismo perfil y misma versión (si aplicó con versión).
      const cvFilter = { profileId };
      if (profileVersionId) {
        cvFilter.profileVersionId = profileVersionId;
      } else {
        cvFilter.$or = [{ profileVersionId: null }, { profileVersionId: { $exists: false } }];
      }
      const postulantDocId = po.postulant?._id?.toString();
      const postulantDoc = postulantDocId
        ? await Postulant.findById(postulantDocId).select("_id phone alternateEmail linkedinLink").lean()
        : null;

      let cvs = [];
      if (profileId) {
        cvs = await ProfileCv.find(cvFilter)
          .populate("attachmentId", "name filepath contentType")
          .sort({ _id: -1 })
          .limit(1)
          .lean();
        if (cvs.length === 0 && !profileVersionId) {
          const fallback = await ProfileCv.find({ profileId }).populate("attachmentId", "name filepath contentType").sort({ _id: -1 }).limit(1).lean();
          if (fallback.length > 0) cvs = fallback;
        }
      }
      const [skills] = await Promise.all([
        profileId
          ? ProfileSkill.find({ profileId }).populate("skillId", "name").lean()
          : [],
      ]);

      const name = (po.postulant?.postulantId?.name || po.postulant?.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      const years = po.postulantProfile?.yearsExperience ?? po.postulantProfile?.totalTimeExperience;
      const añosExperiencia = years != null ? `${years} Año(s) de experiencia` : null;

      const [enrolledList, graduateList] = await Promise.all([
        profileId ? ProfileEnrolledProgram.find({ profileId }).populate("programId", "name level").lean() : [],
        profileId ? ProfileGraduateProgram.find({ profileId }).populate("programId", "name level").lean() : [],
      ]);

      res.json({
        _id: po._id,
        _source: "postulacion_oportunidad",
        nombres: nombres || "—",
        apellidos,
        email: po.postulant?.postulantId?.email || postulantDoc?.alternateEmail || "—",
        telefono: postulantDoc?.phone || "—",
        linkedin: postulantDoc?.linkedinLink || null,
        fechaAplicacion: po.fechaAplicacion,
        estado: po.estado,
        estadoLabel: { aplicado: "Enviado", empresa_consulto_perfil: "Revisado", empresa_descargo_hv: "HV descargada", seleccionado_empresa: "Seleccionado", aceptado_estudiante: "Aceptado", rechazado: "Rechazado" }[po.estado] || po.estado,
        programasEnCurso: enrolledList.map((e) => e.programId?.name || e.programId?.level || "—"),
        programasFinalizados: graduateList.map((g) => g.programId?.name || g.programId?.level || "—"),
        añosExperiencia,
        competencias: skills.map((s) => s.skillId?.name).filter(Boolean),
        hojasDeVida: cvs.map((c) => ({
          attachmentId: c.attachmentId?._id,
          name: c.attachmentId?.name || "Hoja de vida",
          postulantDocId: postulantDocId || postulantDoc?._id?.toString(),
        })),
      });
      return;
    }

    const oppWithLegacy = await Opportunity.findById(opportunityId)
      .populate({ path: "postulaciones.estudiante", select: "studentId faculty program user", populate: { path: "user", select: "name email" } })
      .lean();
    const legacy = (oppWithLegacy?.postulaciones || []).find(
      (p) => p._id && p._id.toString() === postulacionId
    );
    if (legacy) {
      const leg = legacy;
      const estudiante = leg.estudiante || {};
      if (adminScope?.programTerms?.length) {
        const programName = String(estudiante.program || "").toLowerCase();
        const allowed = adminScope.programTerms.some((t) => programName.includes(String(t).toLowerCase()));
        if (!allowed) return res.status(403).json({ message: "No autorizado para ver esta postulación." });
      }
      const name = (estudiante.user?.name || estudiante.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      res.json({
        _id: leg._id,
        _source: "legacy",
        nombres: nombres || "—",
        apellidos,
        email: estudiante.user?.email || "—",
        telefono: "—",
        linkedin: null,
        fechaAplicacion: leg.fechaPostulacion,
        estado: leg.estado,
        estadoLabel: "Enviado",
        programasEnCurso: estudiante.program ? [estudiante.program] : [],
        programasFinalizados: [],
        añosExperiencia: null,
        competencias: [],
        hojasDeVida: [],
      });
      return;
    }

    return res.status(404).json({ message: "Postulación no encontrada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** PATCH /opportunities/:id/applications/:postulacionId/state — Rechazar postulante o revertir rechazo (solo PostulacionOportunidad). */
export const updateApplicationState = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;
    const { estado, motivoNoAprobacion, motivo, comentarios } = req.body;

    if (!estado || !["rechazado", "empresa_consulto_perfil"].includes(estado)) {
      return res.status(400).json({
        message: "estado debe ser 'rechazado' o 'empresa_consulto_perfil' (para deshacer rechazo)",
      });
    }

    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    });
    if (!po) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    if (estado === "rechazado") {
      const razon = (motivoNoAprobacion ?? motivo ?? comentarios ?? "").toString().trim();
      if (!razon) {
        return res.status(400).json({
          message: "Debe indicar la razón de no aprobación para rechazar una postulación.",
        });
      }
      po.estado = "rechazado";
      po.rechazadoAt = new Date();
      po.comentarios = razon;
    } else {
      po.estado = "empresa_consulto_perfil";
      po.rechazadoAt = null;
    }
    await po.save();

    if (estado === "rechazado") {
      const ctx = await loadPracticaPostulacionContext(postulacionId);
      if (ctx) {
        const razon = (motivoNoAprobacion ?? motivo ?? comentarios ?? "").toString().trim();
        await dispatchPracticaNotification(
          "no_aceptacion_inscripcion_oportunidad_estudiantes",
          { ...ctx.datos, COMENTARIO: razon || "Su postulación no fue aceptada." },
          studentOnlyRecipientContext(ctx.postulantEmail),
          { postulacionId: String(postulacionId), opportunityId: String(opportunityId) }
        );
      }
    }

    const estadoLabel = estado === "rechazado" ? "Rechazado" : "Revisado";
    res.json({
      message: estado === "rechazado" ? "Postulante rechazado" : "Rechazo revertido",
      estado: po.estado,
      estadoLabel,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** PATCH /opportunities/:id/applications/:postulacionId/descargo-hv — Marca que la empresa descargó la HV (empresaDescargoHvAt, estado empresa_descargo_hv). */
export const markApplicationDescargoHv = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;
    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    });
    if (!po) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }
    po.empresaDescargoHvAt = new Date();
    if (po.estado !== "empresa_descargo_hv") {
      po.estado = "empresa_descargo_hv";
    }
    await po.save();

    const ctxHv = await loadPracticaPostulacionContext(postulacionId);
    if (ctxHv) {
      await dispatchPracticaNotification(
        "envio_hojas_vida_estudiante_entidad",
        {
          ...ctxHv.datos,
          OBSERVACION:
            "La entidad registró la descarga o consulta de la hoja de vida del postulante en el sistema.",
        },
        entityAndCoordinatorsRecipientContext(ctxHv.creadorEmail),
        { postulacionId: String(postulacionId), opportunityId: String(opportunityId), source: "descargo_hv" }
      );
    }

    res.json({
      message: "HV marcada como descargada",
      empresaDescargoHvAt: po.empresaDescargoHvAt,
      estado: po.estado,
      estadoLabel: "HV descargada",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Revisar/Seleccionar postulación
export const reviewApplication = async (req, res) => {
  try {
    const { id, postulacionId } = req.params;
    const { estado, comentarios } = req.body;

    const validStates = ["pendiente", "en_revision", "seleccionado", "rechazado"];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ 
        message: `Estado inválido. Estados válidos: ${validStates.join(", ")}` 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const postulacion = opportunity.postulaciones.id(postulacionId);
    if (!postulacion) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    postulacion.estado = estado;
    postulacion.comentarios = comentarios || null;
    postulacion.revisadoPor = req.user.id;
    postulacion.fechaRevision = new Date();

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email");

    if (String(opportunity.tipo || "").toLowerCase() === "practica" && (estado === "seleccionado" || estado === "rechazado")) {
      try {
        const oppPop = await Opportunity.findById(id)
          .populate("company", "name commercialName")
          .populate("creadoPor", "email name")
          .lean();
        const stud = await Student.findById(postulacion.estudiante).populate("user", "name email").lean();
        const datos = buildDatosPracticaSimple(oppPop, stud?.user, {
          COMENTARIO: comentarios || "",
          OBSERVACION: comentarios || "",
        });
        const meta = { opportunityId: String(id), source: "reviewApplication_legacy_embedded" };
        if (estado === "seleccionado") {
          await dispatchPracticaNotification(
            "aceptacion_inscripcion_oportunidad_estudiantes",
            datos,
            studentOnlyRecipientContext(stud?.user?.email),
            meta
          );
        } else {
          await dispatchPracticaNotification(
            "no_aceptacion_inscripcion_oportunidad_estudiantes",
            datos,
            studentOnlyRecipientContext(stud?.user?.email),
            meta
          );
        }
      } catch (notifyErr) {
        console.error("[opportunities] reviewApplication notificación:", notifyErr?.message || notifyErr);
      }
    }

    res.json({
      message: `Postulación ${estado === "seleccionado" ? "seleccionada" : "actualizada"} correctamente`,
      postulacion: updatedOpportunity.postulaciones.id(postulacionId)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Seleccionar múltiples postulantes
export const selectMultipleApplications = async (req, res) => {
  try {
    const { id } = req.params;
    const { postulacionIds, comentarios } = req.body;

    if (!postulacionIds || !Array.isArray(postulacionIds) || postulacionIds.length === 0) {
      return res.status(400).json({ 
        message: "Debe proporcionar al menos un ID de postulación" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que no se exceda el número de vacantes
    const vacantesDisponibles = opportunity.vacantes || Infinity;
    const seleccionadosActuales = opportunity.postulaciones.filter(
      p => p.estado === "seleccionado"
    ).length;

    if (seleccionadosActuales + postulacionIds.length > vacantesDisponibles) {
      return res.status(400).json({ 
        message: `No se pueden seleccionar más postulantes. Vacantes disponibles: ${vacantesDisponibles - seleccionadosActuales}` 
      });
    }

    // Actualizar cada postulación
    postulacionIds.forEach(postulacionId => {
      const postulacion = opportunity.postulaciones.id(postulacionId);
      if (postulacion) {
        postulacion.estado = "seleccionado";
        postulacion.comentarios = comentarios || null;
        postulacion.revisadoPor = req.user.id;
        postulacion.fechaRevision = new Date();
      }
    });

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email");

    if (String(opportunity.tipo || "").toLowerCase() === "practica") {
      try {
        const oppPop = await Opportunity.findById(id)
          .populate("company", "name commercialName")
          .populate("creadoPor", "email name")
          .lean();
        for (const pid of postulacionIds) {
          const sub = opportunity.postulaciones.id(pid);
          if (!sub) continue;
          const stud = await Student.findById(sub.estudiante).populate("user", "name email").lean();
          const datos = buildDatosPracticaSimple(oppPop, stud?.user, {
            COMENTARIO: comentarios || "",
            OBSERVACION: comentarios || "",
          });
          await dispatchPracticaNotification(
            "aceptacion_inscripcion_oportunidad_estudiantes",
            datos,
            studentOnlyRecipientContext(stud?.user?.email),
            { opportunityId: String(id), source: "selectMultipleApplications_legacy_embedded" }
          );
        }
      } catch (notifyErr) {
        console.error("[opportunities] selectMultipleApplications notificación:", notifyErr?.message || notifyErr);
      }
    }

    res.json({
      message: `${postulacionIds.length} postulante(s) seleccionado(s) correctamente`,
      opportunity: updatedOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Aprobar oportunidad por programa académico
export const approveProgram = async (req, res) => {
  try {
    const { id } = req.params;
    const { programa, comentarios } = req.body; // programa: { level, program }

    if (!programa || !programa.level || !programa.program) {
      return res.status(400).json({ 
        message: "Debe proporcionar el programa (level y program)" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que la oportunidad está en revisión
    if (opportunity.estado !== "En Revisión") {
      return res.status(400).json({ 
        message: "Solo se pueden aprobar programas cuando la oportunidad está en revisión" 
      });
    }

    // Buscar la aprobación del programa
    const aprobacionIndex = opportunity.aprobacionesPorPrograma.findIndex(
      ap => ap.programa.level === programa.level && ap.programa.program === programa.program
    );

    if (aprobacionIndex === -1) {
      return res.status(404).json({ 
        message: "Programa no encontrado en la formación académica de esta oportunidad" 
      });
    }

    // Actualizar la aprobación
    opportunity.aprobacionesPorPrograma[aprobacionIndex].estado = "aprobado";
    opportunity.aprobacionesPorPrograma[aprobacionIndex].aprobadoPor = req.user.id;
    opportunity.aprobacionesPorPrograma[aprobacionIndex].fechaAprobacion = new Date();
    opportunity.aprobacionesPorPrograma[aprobacionIndex].comentarios = comentarios || null;

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("aprobacionesPorPrograma.aprobadoPor", "name email")
      .populate("creadoPor", "name email");

    if (String(updatedOpportunity?.tipo || "").toLowerCase() === "practica") {
      await dispatchPracticaNotification(
        "actualizacion_estado_oportunidad",
        {
          NOMBRE_OPORTUNIDAD: updatedOpportunity?.nombreCargo || "",
          ESTADO_OPORTUNIDAD: `Programa académico aprobado: ${programa.program} (${programa.level})`,
          OBSERVACION: (comentarios || "").toString().trim(),
          LINK: practicaOpportunityDashboardLink(id),
        },
        {
          ...entityAndCoordinatorsRecipientContext(updatedOpportunity?.creadoPor?.email),
          lider_practica: [updatedOpportunity?.creadoPor?.email].filter(Boolean),
        },
        { opportunityId: String(id), source: "approveProgram" }
      );
    }

    res.json({
      message: `Programa ${programa.program} aprobado correctamente`,
      opportunity: updatedOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Rechazar oportunidad por programa académico
export const rejectProgram = async (req, res) => {
  try {
    const { id } = req.params;
    const { programa, comentarios } = req.body; // programa: { level, program }

    if (!programa || !programa.level || !programa.program) {
      return res.status(400).json({ 
        message: "Debe proporcionar el programa (level y program)" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que la oportunidad está en revisión
    if (opportunity.estado !== "En Revisión") {
      return res.status(400).json({ 
        message: "Solo se pueden rechazar programas cuando la oportunidad está en revisión" 
      });
    }

    // Buscar la aprobación del programa
    const aprobacionIndex = opportunity.aprobacionesPorPrograma.findIndex(
      ap => ap.programa.level === programa.level && ap.programa.program === programa.program
    );

    if (aprobacionIndex === -1) {
      return res.status(404).json({ 
        message: "Programa no encontrado en la formación académica de esta oportunidad" 
      });
    }

    // Actualizar la aprobación
    opportunity.aprobacionesPorPrograma[aprobacionIndex].estado = "rechazado";
    opportunity.aprobacionesPorPrograma[aprobacionIndex].aprobadoPor = req.user.id;
    opportunity.aprobacionesPorPrograma[aprobacionIndex].fechaAprobacion = new Date();
    opportunity.aprobacionesPorPrograma[aprobacionIndex].comentarios = comentarios || null;

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("aprobacionesPorPrograma.aprobadoPor", "name email")
      .populate("creadoPor", "name email");

    if (String(updatedOpportunity?.tipo || "").toLowerCase() === "practica") {
      await dispatchPracticaNotification(
        "actualizacion_estado_oportunidad",
        {
          NOMBRE_OPORTUNIDAD: updatedOpportunity?.nombreCargo || "",
          ESTADO_OPORTUNIDAD: `Programa académico no aprobado: ${programa.program} (${programa.level})`,
          OBSERVACION: (comentarios || "").toString().trim(),
          LINK: practicaOpportunityDashboardLink(id),
        },
        {
          ...entityAndCoordinatorsRecipientContext(updatedOpportunity?.creadoPor?.email),
          lider_practica: [updatedOpportunity?.creadoPor?.email].filter(Boolean),
        },
        { opportunityId: String(id), source: "rejectProgram" }
      );
    }

    res.json({
      message: `Programa ${programa.program} rechazado correctamente`,
      opportunity: updatedOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};