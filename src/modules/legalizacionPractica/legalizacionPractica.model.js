import mongoose from "mongoose";

/**
 * Legalización de práctica / pasantía (RQ04_HU004).
 * Una por postulación aceptada por el estudiante (PostulacionOportunidad).
 */
const historialEntrySchema = new mongoose.Schema(
  {
    estadoAnterior: { type: String, default: null },
    estadoNuevo: { type: String, required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fecha: { type: Date, default: Date.now },
    detalle: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { _id: false }
);

const legalizacionPracticaSchema = new mongoose.Schema(
  {
    postulacionOportunidad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionOportunidad",
      required: true,
      unique: true,
      index: true,
    },
    estado: {
      type: String,
      enum: ["borrador", "en_revision", "aprobada", "rechazada", "en_ajuste"],
      default: "borrador",
      index: true,
    },
    /**
     * Cuando el acuerdo de vinculación tenga las 3 firmas (HU006), poner true vía servicio de acuerdos.
     * Mientras tanto false: no se aprueba manualmente el doc. con bindingAgreement en true.
     */
    acuerdoTresFirmasCompletas: { type: Boolean, default: false },
    documentos: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    enviadoRevisionAt: { type: Date, default: null },
    aprobadoAt: { type: Date, default: null },
    rechazadoAt: { type: Date, default: null },
    rechazoMotivo: { type: String, default: null },
    historial: { type: [historialEntrySchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("LegalizacionPractica", legalizacionPracticaSchema, "legalizaciones_practica");
