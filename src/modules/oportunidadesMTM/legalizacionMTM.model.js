import mongoose from "mongoose";

const legalizacionHistorialEntrySchema = new mongoose.Schema(
  {
    estadoAnterior: { type: String, default: null },
    estadoNuevo: { type: String, default: null },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fecha: { type: Date, default: Date.now },
    detalle: { type: String, default: "" },
    ip: { type: String, default: null },
  },
  { _id: false }
);

/**
 * Legalización MTM (RQ04_HU004). Una por postulación aceptada.
 * Estado: creada → en_revision → aprobada | rechazada | en_ajuste.
 *         aprobada → solicitada_finalizacion (estudiante solicita cierre, RQ04_HU011)
 *                  → finalizada (coordinador confirma el cierre).
 * `finalizada` también llega desde legado UrJobs (flujo completado en migración).
 * Por documento: estadoDocumento pendiente | aprobado | rechazado + motivoRechazo (revisión coordinador).
 *
 * `historial`: migrado desde monitoring_legalized + change_status_monitoring_legalized (migrateOpportunitiesFromMySQL.js).
 */
const legalizacionMTMSchema = new mongoose.Schema(
  {
    /** PK MySQL `monitoring_legalized.monitoring_legalized_id`; trazabilidad migración. */
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
      enum: ["creada", "en_revision", "aprobada", "solicitada_finalizacion", "finalizada", "rechazada", "en_ajuste"],
      default: "creada",
      index: true,
    },
    eps: { type: mongoose.Schema.Types.ObjectId, ref: "items", default: null },
    tipoCuenta: { type: mongoose.Schema.Types.ObjectId, ref: "items", default: null },
    /** Tipo de cuenta directo: "Ahorros" | "Corriente" (sin depender de lista parametrizada). */
    tipoCuentaValor: { type: String, enum: ["Ahorros", "Corriente"], default: null },
    /** Ítem catálogo bancos: `listId` L_FINANCIAL_BANK (Gestión de parámetros → Bancos). */
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
    solicitadaFinalizacionAt: { type: Date, default: null },
    finalizadaAt: { type: Date, default: null },
    rechazoMotivo: { type: String, default: null },
    historial: {
      type: [legalizacionHistorialEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

legalizacionMTMSchema.index({ postulacionMTM: 1 });

export default mongoose.model("LegalizacionMTM", legalizacionMTMSchema, "legalizaciones_mtm");
