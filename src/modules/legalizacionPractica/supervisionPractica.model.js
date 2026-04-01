import mongoose from "mongoose";

/**
 * RQ04_HU008 — Supervisión de la práctica (monitor / unidades académicas).
 * Informe con firma estudiante, monitor y tutor; PDF al completar firmas.
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

const documentoSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    originalName: { type: String, default: null },
    contentType: { type: String, default: null },
    size: { type: Number, default: null },
    uploadedAt: { type: Date, default: Date.now },
    /** post_firma: cargue del estudiante tras firmas; monitor: adjuntos del monitor */
    origen: { type: String, enum: ["monitor", "estudiante_post_firma"], default: "monitor" },
  },
  { _id: true }
);

const supervisionPracticaSchema = new mongoose.Schema(
  {
    postulacionOportunidad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionOportunidad",
      required: true,
      index: true,
    },
    tipoActividadSeguimiento: {
      type: String,
      enum: ["parcial", "final"],
      required: true,
      index: true,
    },
    /** Opcional: id del ítem en plan.seguimientosPlan para sugerir fecha */
    seguimientoPlanItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    fecha: { type: Date, required: true },
    tipoSeguimientoMedio: { type: String, trim: true, default: "Medio electrónico" },
    productoOInforme: { type: String, trim: true, default: "" },
    ponderacionPorcentaje: { type: Number, min: 0, max: 100, default: 0 },
    monitorNombres: { type: String, trim: true, default: "" },
    monitorApellidos: { type: String, trim: true, default: "" },
    monitorEmail: { type: String, trim: true, default: "" },
    planEstudios: { type: String, trim: true, default: "" },
    semestre: { type: String, trim: true, default: "" },
    emailEstudiante: { type: String, trim: true, default: "" },
    diasHorasAcumuladasAlMomento: { type: Number, default: null },
    nota: { type: Number, default: null },
    aprueba: { type: Boolean, default: false },
    observaciones: { type: String, trim: true, maxlength: 10000, default: "" },
    estado: {
      type: String,
      enum: ["borrador", "pendiente_firmas", "firmas_completas", "cerrado"],
      default: "borrador",
      index: true,
    },
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
    documentos: { type: [documentoSchema], default: [] },
    enviadoFirmasAt: { type: Date, default: null },
    firmasCompletasAt: { type: Date, default: null },
    pdfS3Key: { type: String, default: null },
    pdfGeneradoAt: { type: Date, default: null },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

supervisionPracticaSchema.index({ postulacionOportunidad: 1, tipoActividadSeguimiento: 1, createdAt: -1 });

export default mongoose.model("SupervisionPractica", supervisionPracticaSchema, "supervisiones_practica");
