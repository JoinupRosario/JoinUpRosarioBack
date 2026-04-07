import mongoose from "mongoose";

/**
 * Registro de cambio de estado de una oferta (práctica o MTM), alineado a datos MySQL.
 * Origen `mysql_change_status_opportunity`: fila de `change_status_opportunity`.
 * Origen `mysql_opportunity_snapshot`: estado vigente en `opportunity` cuando no hay log en MySQL.
 *
 * La UI puede listar por `opportunity` / `oportunidadMtm` o por `opportunityMysqlId` sin depender
 * de textos fijos en el migrador.
 */
const DOMINIOS = ["practica", "mtm"];
const ORIGENES = ["mysql_change_status_opportunity", "mysql_opportunity_snapshot"];

const contratoLegadoSchema = new mongoose.Schema(
  {
    contract: { type: mongoose.Schema.Types.Mixed, default: null },
    contracted: { type: String, default: null },
    whyNoContracted: { type: String, default: null },
  },
  { _id: false }
);

const opportunityStatusChangeLogSchema = new mongoose.Schema(
  {
    /** `change_status_opportunity.id` (null en filas snapshot). */
    mysqlRowId: { type: Number, default: null, index: true, sparse: true },
    /** Idempotencia snapshot: p. ej. snapshot_practica_30 / snapshot_mtm_40 */
    snapshotKey: { type: String, default: null, index: true, sparse: true },
    opportunityMysqlId: { type: Number, required: true, index: true },
    dominio: { type: String, enum: DOMINIOS, required: true, index: true },
    origen: { type: String, enum: ORIGENES, required: true, index: true },
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: "Opportunity", default: null },
    oportunidadMtm: { type: mongoose.Schema.Types.ObjectId, ref: "OportunidadMTM", default: null },
    fecha: { type: Date, required: true },
    statusBeforeRaw: { type: String, default: null },
    statusAfterRaw: { type: String, default: null },
    /** Etiqueta canónica según dominio (práctica: Creada|…; MTM: Borrador|…). */
    estadoAnteriorMongo: { type: String, default: null },
    estadoNuevoMongo: { type: String, required: true },
    motivo: { type: String, default: null },
    userCreatorRaw: { type: String, default: null },
    comentario: { type: String, default: null },
    contratoLegado: { type: contratoLegadoSchema, default: null },
    cambiadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    meta: {
      runId: { type: String, default: null, index: true },
      migration: { type: String, default: "migrateOpportunitiesFromMySQL" },
    },
  },
  { timestamps: true }
);

opportunityStatusChangeLogSchema.index({ opportunityMysqlId: 1, fecha: 1 });
opportunityStatusChangeLogSchema.index({ opportunity: 1, fecha: 1 });
opportunityStatusChangeLogSchema.index({ oportunidadMtm: 1, fecha: 1 });
opportunityStatusChangeLogSchema.index({ mysqlRowId: 1 }, { unique: true, sparse: true });
opportunityStatusChangeLogSchema.index({ snapshotKey: 1 }, { unique: true, sparse: true });

export const OPPORTUNITY_STATUS_CHANGE_ORIGINS = ORIGENES;
export const OPPORTUNITY_STATUS_CHANGE_DOMINIOS = DOMINIOS;

export default mongoose.model(
  "OpportunityStatusChangeLog",
  opportunityStatusChangeLogSchema,
  "opportunity_status_change_logs"
);
