import mongoose from "mongoose";

/**
 * RQ04_HU008: Registro de seguimientos Plan de Trabajo.
 * Campos: tipo actividad, fecha, número estudiantes convocados/atendidos, cantidad horas, comentarios, documento soporte.
 * Estado: pendiente_revision → aprobado | rechazado (revisión por coordinador).
 * Las horas aprobadas se contabilizan para reporte de reconocimiento DAF.
 */
const documentoSoporteSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    originalName: { type: String, default: null },
    size: { type: Number, default: null },
  },
  { _id: false }
);

const seguimientoMTMSchema = new mongoose.Schema(
  {
    postulacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionMTM",
      required: true,
      index: true,
    },
    /** Tipo de actividad (HU008) */
    tipoActividad: { type: String, trim: true, maxlength: 150, default: "" },
    fecha: { type: Date, required: true, default: Date.now },
    /** Número de estudiantes convocados (HU008) */
    numeroEstudiantesConvocados: { type: Number, default: null, min: 0 },
    /** Número de estudiantes atendidos (HU008) */
    numeroEstudiantesAtendidos: { type: Number, default: null, min: 0 },
    /** Cantidad de horas (HU008) — contabilizadas cuando está aprobado */
    cantidadHoras: { type: Number, default: null, min: 0 },
    /** Comentarios (HU008) */
    comentarios: { type: String, trim: true, default: "" },
    /** Documento de soporte opcional (HU008) */
    documentoSoporte: { type: documentoSoporteSchema, default: null },
    /** Estado: pendiente_revision | aprobado | rechazado. Todas quedan Pendiente de Revisión al crear. */
    estado: {
      type: String,
      enum: ["pendiente_revision", "aprobado", "rechazado"],
      default: "pendiente_revision",
      index: true,
    },
    rechazoMotivo: { type: String, trim: true, default: null },
    aprobadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    aprobadoAt: { type: Date, default: null },
    rechazadoAt: { type: Date, default: null },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Compatibilidad con datos antiguos (tipo/descripcion)
    tipo: { type: String, trim: true, maxlength: 100, default: null },
    descripcion: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

seguimientoMTMSchema.index({ postulacionMTM: 1, createdAt: -1 });
seguimientoMTMSchema.index({ postulacionMTM: 1, estado: 1 });

export default mongoose.model("SeguimientoMTM", seguimientoMTMSchema, "seguimientos_mtm");
