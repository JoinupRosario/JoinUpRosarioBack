import mongoose from "mongoose";
import {
  LEGALIZACION_ESTADOS,
  DEFAULT_LEGALIZACION_ESTADO,
} from "../../constants/domainEstados.js";

/**
 * Legalización MTM (RQ04_HU004). Una por postulación aceptada.
 * Estado: borrador → en_revision → aprobada | rechazada | en_ajuste (coordinador pide ajustes).
 * Por documento: estadoDocumento pendiente | aprobado | rechazado + motivoRechazo (revisión coordinador).
 */
const historialLegalizacionEntrySchema = new mongoose.Schema(
  {
    estadoAnterior: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v == null || v === "" || LEGALIZACION_ESTADOS.includes(v),
        message: "estadoAnterior debe ser un estado de legalización válido o vacío",
      },
    },
    estadoNuevo: { type: String, required: true, enum: LEGALIZACION_ESTADOS },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fecha: { type: Date, default: Date.now },
    detalle: { type: String, default: null },
    ip: { type: String, default: null },
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
      enum: LEGALIZACION_ESTADOS,
      default: DEFAULT_LEGALIZACION_ESTADO,
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
    /** Trazabilidad legada (MySQL change_status_monitoring_legalized). */
    historial: { type: [historialLegalizacionEntrySchema], default: [] },
  },
  { timestamps: true }
);

legalizacionMTMSchema.index({ postulacionMTM: 1 });

export default mongoose.model("LegalizacionMTM", legalizacionMTMSchema, "legalizaciones_mtm");
