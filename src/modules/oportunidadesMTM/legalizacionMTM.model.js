import mongoose from "mongoose";

/**
 * Legalización MTM (RQ04_HU004). Una por postulación aceptada.
 * Estado: borrador → en_revision → aprobada | rechazada | en_ajuste (coordinador pide ajustes).
 * Por documento: estadoDocumento pendiente | aprobado | rechazado + motivoRechazo (revisión coordinador).
 */
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
    /**
     * Archivos por definición de documento (DocumentMonitoringDefinition).
     * Clave: string del _id de la definición. Valor: { key, originalName, size, estadoDocumento, motivoRechazo }
     * (estructura equivalente a docSchema; Mixed permite claves dinámicas).
     */
    documentos: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
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
