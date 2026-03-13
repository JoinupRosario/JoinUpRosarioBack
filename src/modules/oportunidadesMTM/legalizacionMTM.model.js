import mongoose from "mongoose";

/**
 * Legalización MTM (RQ04_HU004). Una por postulación aceptada.
 * Estado: borrador → en_revision → aprobada | rechazada | en_ajuste (coordinador pide ajustes).
 * Por documento: estadoDocumento pendiente | aprobado | rechazado + motivoRechazo (revisión coordinador).
 */
const docSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    originalName: { type: String, default: null },
    size: { type: Number, default: null },
    estadoDocumento: { type: String, enum: ["pendiente", "aprobado", "rechazado"], default: "pendiente" },
    motivoRechazo: { type: String, default: null },
  },
  { _id: false }
);

const legalizacionMTMSchema = new mongoose.Schema(
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
      enum: ["borrador", "en_revision", "aprobada", "rechazada", "en_ajuste"],
      default: "borrador",
      index: true,
    },
    eps: { type: mongoose.Schema.Types.ObjectId, ref: "items", default: null },
    tipoCuenta: { type: mongoose.Schema.Types.ObjectId, ref: "items", default: null },
    /** Tipo de cuenta directo: "Ahorros" | "Corriente" (sin depender de lista parametrizada). */
    tipoCuentaValor: { type: String, enum: ["Ahorros", "Corriente"], default: null },
    banco: { type: mongoose.Schema.Types.ObjectId, ref: "items", default: null },
    numeroCuenta: { type: String, trim: true, default: null },
    documentos: {
      certificadoEps: { type: docSchema, default: null },
      certificacionBancaria: { type: docSchema, default: null },
      rut: { type: docSchema, default: null },
    },
    enviadoRevisionAt: { type: Date, default: null },
    aprobadoAt: { type: Date, default: null },
    rechazadoAt: { type: Date, default: null },
    rechazoMotivo: { type: String, default: null },
  },
  { timestamps: true }
);

legalizacionMTMSchema.index({ postulacionMTM: 1 });

export default mongoose.model("LegalizacionMTM", legalizacionMTMSchema, "legalizaciones_mtm");
