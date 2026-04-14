import mongoose from "mongoose";

const PLAN_TRABAJO_MTM_ESTADOS = ["borrador", "enviado_revision", "aprobado", "rechazado"];

/**
 * RQ04_HU006: Plan de trabajo MTM. Uno por postulación con legalización aprobada.
 * Estado: borrador → enviado_revision → aprobado | rechazado
 * Permite crear, modificar y enviar a revisión; el profesor aprueba para habilitar seguimientos.
 */
const actividadSchema = new mongoose.Schema(
  {
    fecha: { type: Date, required: true },
    tema: { type: String, trim: true, default: "" },
    estrategiasMetodologias: { type: String, trim: true, default: "" },
  },
  { _id: true }
);

const planDeTrabajoMTMSchema = new mongoose.Schema(
  {
    /** PK MySQL `monitoring_plan.id`; trazabilidad migración. */
    mysqlId: { type: Number, default: null, index: true, sparse: true },

    postulacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionMTM",
      required: true,
      unique: true,
      index: true,
    },
    estado: {
      type: String,
      enum: PLAN_TRABAJO_MTM_ESTADOS,
      default: "borrador",
      index: true,
    },
    // Datos pre-cargados de la MTM (para PDF y vista)
    facultad: { type: String, trim: true, default: "" },
    programa: { type: String, trim: true, default: "" },
    asignaturaArea: { type: String, trim: true, default: "" },
    periodo: { type: String, trim: true, default: "" },
    profesorResponsable: { type: String, trim: true, default: "" },
    codigoMonitor: { type: String, trim: true, default: "" },
    nombreMonitor: { type: String, trim: true, default: "" },
    telefono: { type: String, trim: true, default: "" },
    correoInstitucional: { type: String, trim: true, default: "" },
    // Campos que diligencia el estudiante
    justificacion: { type: String, trim: true, default: "" },
    /** Legado MySQL monitoring_plan.general_skills / specific_skills / observations */
    habilidadesGenerales: { type: String, trim: true, default: "" },
    habilidadesEspecificas: { type: String, trim: true, default: "" },
    observacionesPlan: { type: String, trim: true, default: "" },
    objetivoGeneral: { type: String, trim: true, default: "" },
    objetivosEspecificos: { type: String, trim: true, default: "" },
    actividades: [actividadSchema],
    /** Nombre legible del coordinador (MySQL monitoring_legalized.user_coordinator → User). */
    coordinadorMonitoria: { type: String, trim: true, default: "" },
    // Aprobaciones y trazabilidad
    enviadoRevisionAt: { type: Date, default: null },
    aprobadoPorProfesorAt: { type: Date, default: null },
    rechazadoAt: { type: Date, default: null },
    rechazoMotivo: { type: String, default: null },
    aprobadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

planDeTrabajoMTMSchema.index({ postulacionMTM: 1 });

export default mongoose.model("PlanDeTrabajoMTM", planDeTrabajoMTMSchema, "planes_trabajo_mtm");
