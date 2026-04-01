import mongoose from "mongoose";

/**
 * RQ04_HU007 — Registro de actividades de seguimiento del plan de práctica.
 * Habilitado con legalización aprobada y plan de práctica aprobado.
 */
const documentoSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    originalName: { type: String, default: null },
    contentType: { type: String, default: null },
    size: { type: Number, default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const seguimientoPracticaSchema = new mongoose.Schema(
  {
    postulacionOportunidad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionOportunidad",
      required: true,
      index: true,
    },
    /** Nombre o título de la actividad */
    actividad: { type: String, trim: true, maxlength: 500, default: "" },
    /** Tipo de actividad (p. ej. alineado al plan o texto libre) */
    tipoActividad: { type: String, trim: true, maxlength: 300, default: "" },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, required: true },
    observaciones: { type: String, trim: true, maxlength: 4000, default: "" },
    descripcion: { type: String, trim: true, maxlength: 5000, default: "" },
    documentos: { type: [documentoSchema], default: [] },
    /** El estudiante registra días O horas en cada registro (no ambos obligatorios) */
    unidadTiempo: { type: String, enum: ["dias", "horas"], required: true },
    cantidad: { type: Number, required: true, min: 0 },
    estado: {
      type: String,
      enum: ["pendiente_revision", "aprobado", "rechazado"],
      default: "pendiente_revision",
      index: true,
    },
    /** Aprobación monitor (sí/no) reflejada en estado; fecha al aprobar */
    fechaAprobacionMonitor: { type: Date, default: null },
    observacionesRechazo: { type: String, trim: true, default: null },
    aprobadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rechazadoAt: { type: Date, default: null },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

seguimientoPracticaSchema.index({ postulacionOportunidad: 1, createdAt: -1 });
seguimientoPracticaSchema.index({ postulacionOportunidad: 1, estado: 1 });

export default mongoose.model("SeguimientoPractica", seguimientoPracticaSchema, "seguimientos_practica");
