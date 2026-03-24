import mongoose from "mongoose";

const slotFirmaSchema = new mongoose.Schema(
  {
    estado: {
      type: String,
      enum: ["pendiente", "aprobado", "rechazado"],
      default: "pendiente",
    },
    fecha: { type: Date, default: null },
    ip: { type: String, default: null, maxlength: 64 },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    motivoRechazo: { type: String, default: null, maxlength: 2000 },
  },
  { _id: false }
);

/**
 * Instancia de acuerdo de vinculación (RQ04_HU006): PDF congelado en S3, tres firmas con token + IP.
 * Una fila por postulación aceptada (re-emisión tras rechazo actualiza la misma fila).
 */
const acuerdoVinculacionPracticaSchema = new mongoose.Schema(
  {
    postulacionOportunidad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionOportunidad",
      required: true,
      unique: true,
      index: true,
    },
    /** pendiente_firmas | aprobado | rechazado (rechazado = al menos una parte rechazó) */
    estado: {
      type: String,
      enum: ["pendiente_firmas", "aprobado", "rechazado"],
      default: "pendiente_firmas",
      index: true,
    },
    creador: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /** Objeto S3 del PDF emitido (snapshot) */
    pdfSnapshotS3Key: { type: String, required: true, trim: true },
    /** Tokens opacos para enlaces de firma (sin login). */
    tokenPracticante: { type: String, required: true },
    tokenEscenario: { type: String, required: true },
    tokenUniversidad: { type: String, required: true },
    firmas: {
      practicante: { type: slotFirmaSchema, default: () => ({}) },
      escenario: { type: slotFirmaSchema, default: () => ({}) },
      universidad: { type: slotFirmaSchema, default: () => ({}) },
    },
    /** Versión lógica de re-emisiones tras rechazo */
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

acuerdoVinculacionPracticaSchema.index({ tokenPracticante: 1 });
acuerdoVinculacionPracticaSchema.index({ tokenEscenario: 1 });
acuerdoVinculacionPracticaSchema.index({ tokenUniversidad: 1 });

export default mongoose.model(
  "AcuerdoVinculacionPractica",
  acuerdoVinculacionPracticaSchema,
  "acuerdos_vinculacion_practica"
);
