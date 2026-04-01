import mongoose from "mongoose";

/**
 * RQ04_HU006 — Plan de práctica (no MTM). Uno por postulación con legalización aprobada.
 * Flujo: borrador → pendiente_firmas → pendiente_revision → aprobado | rechazado | en_ajuste
 * Modo: formato UR (campos en sistema) o documento externo (PDF).
 */
const firmaSlotSchema = new mongoose.Schema(
  {
    estado: { type: String, enum: ["pendiente", "aprobado"], default: "pendiente" },
    fecha: { type: Date, default: null },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ip: { type: String, default: null },
  },
  { _id: false }
);

const actividadSchema = new mongoose.Schema(
  {
    fecha: { type: Date, required: true },
    tema: { type: String, trim: true, default: "" },
    estrategiasMetodologias: { type: String, trim: true, default: "" },
  },
  { _id: true }
);

const seguimientoPlanSchema = new mongoose.Schema(
  {
    fecha: { type: Date, required: true },
    tema: { type: String, trim: true, default: "" },
    descripcion: { type: String, trim: true, default: "" },
  },
  { _id: true }
);

const ponderacionSchema = new mongoose.Schema(
  {
    concepto: { type: String, trim: true, default: "" },
    porcentaje: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: true }
);

const planPracticaSchema = new mongoose.Schema(
  {
    postulacionOportunidad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionOportunidad",
      required: true,
      unique: true,
      index: true,
    },
    modoPlan: {
      type: String,
      enum: ["formato_ur", "documento_externo"],
      default: "formato_ur",
    },
    estado: {
      type: String,
      enum: ["borrador", "pendiente_firmas", "pendiente_revision", "aprobado", "rechazado", "en_ajuste"],
      default: "borrador",
      index: true,
    },
    // Datos pre-cargados (snapshot al crear)
    facultad: { type: String, trim: true, default: "" },
    programa: { type: String, trim: true, default: "" },
    periodo: { type: String, trim: true, default: "" },
    nombreCargo: { type: String, trim: true, default: "" },
    empresaNombre: { type: String, trim: true, default: "" },
    estudianteNombre: { type: String, trim: true, default: "" },
    estudianteEmail: { type: String, trim: true, default: "" },
    monitorNombre: { type: String, trim: true, default: "" },
    tutorNombres: { type: String, trim: true, default: "" },
    /** Emails para validar firmas (snapshot al enviar a firmas) */
    emailsFirma: {
      estudiante: { type: String, trim: true, default: "" },
      monitor: { type: String, trim: true, default: "" },
      tutor: { type: String, trim: true, default: "" },
    },
    firmas: {
      estudiante: { type: firmaSlotSchema, default: () => ({}) },
      monitor: { type: firmaSlotSchema, default: () => ({}) },
      tutor: { type: firmaSlotSchema, default: () => ({}) },
    },
    objetivoFormativoItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    objetivoFormativoTexto: { type: String, trim: true, default: "" },
    justificacion: { type: String, trim: true, default: "" },
    objetivoGeneral: { type: String, trim: true, default: "" },
    objetivosEspecificos: { type: String, trim: true, default: "" },
    actividades: [actividadSchema],
    seguimientosPlan: [seguimientoPlanSchema],
    ponderacion: [ponderacionSchema],
    documentoExterno: {
      key: { type: String, default: null },
      originalName: { type: String, default: null },
      contentType: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
    },
    advertenciaPonderacion: { type: String, default: null },
    enviadoFirmasAt: { type: Date, default: null },
    firmasCompletasAt: { type: Date, default: null },
    enviadoRevisionAt: { type: Date, default: null },
    aprobadoAt: { type: Date, default: null },
    aprobadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rechazadoAt: { type: Date, default: null },
    rechazoMotivo: { type: String, default: null },
    rechazadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** RQ04_HU007: cierre del caso de seguimiento — solo líder funcional / coordinación */
    seguimientoCasoCerrado: { type: Boolean, default: false },
    seguimientoCerradoAt: { type: Date, default: null },
    seguimientoCerradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** RQ04_HU008: nota definitiva ponderada tras informes de supervisión firmados */
    notaDefinitivaSupervision: { type: Number, default: null },
    supervisionInformesCompleto: { type: Boolean, default: false },
  },
  { timestamps: true }
);

planPracticaSchema.index({ postulacionOportunidad: 1 });

export default mongoose.model("PlanPractica", planPracticaSchema, "planes_practica");
