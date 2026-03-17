import mongoose from "mongoose";

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
    postulacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionMTM",
      required: true,
      unique: true,
      index: true,
    },
    estado: {
      type: String,
      enum: ["borrador", "enviado_revision", "aprobado", "rechazado"],
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
    objetivoGeneral: { type: String, trim: true, default: "" },
    objetivosEspecificos: { type: String, trim: true, default: "" },
    actividades: [actividadSchema],
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
