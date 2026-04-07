import mongoose from "mongoose";
import {
  LEGALIZACION_ESTADOS,
  DEFAULT_LEGALIZACION_ESTADO,
} from "../../constants/domainEstados.js";

/**
 * Legalización de práctica / pasantía (RQ04_HU004).
 * Una por postulación aceptada por el estudiante (PostulacionOportunidad).
 */
const historialEntrySchema = new mongoose.Schema(
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

/** Historial de cambios del plan de trabajo en práctica (MySQL: change_status_practice_plan / change_status_monitoring_plan → practice_plan). */
const historialPlanTrabajoPracticaEntrySchema = new mongoose.Schema(
  {
    fuenteTablaMysql: { type: String, default: null },
    fecha: { type: Date, default: Date.now },
    tipoCambio: { type: String, default: null },
    datosAntes: { type: String, default: null },
    datosDespues: { type: String, default: null },
    observacion: { type: String, default: null },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
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
      enum: LEGALIZACION_ESTADOS,
      default: DEFAULT_LEGALIZACION_ESTADO,
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
    historialPlanTrabajoPractica: { type: [historialPlanTrabajoPracticaEntrySchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("LegalizacionPractica", legalizacionPracticaSchema, "legalizaciones_practica");
