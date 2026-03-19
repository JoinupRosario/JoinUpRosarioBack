import mongoose from "mongoose";

/**
 * Trazabilidad de cambios de estado final en estudiantes habilitados para práctica.
 * Se registra: carga inicial (cargue UXXI) y cada cambio manual (select estado final).
 */
const schema = new mongoose.Schema(
  {
    estudianteHabilitado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EstudianteHabilitado",
      required: true,
      index: true,
    },
    /** Estado anterior (null en la primera carga). */
    estadoAnterior: {
      type: String,
      enum: ["AUTORIZADO", "NO_AUTORIZADO", "EN_REVISION", "EXCLUIDO", null],
      default: null,
    },
    /** Estado nuevo asignado. */
    estadoNuevo: {
      type: String,
      enum: ["AUTORIZADO", "NO_AUTORIZADO", "EN_REVISION", "EXCLUIDO"],
      required: true,
    },
    /** "cargue" = carga desde UXXI; "cambio_manual" = cambio desde el select. */
    tipo: {
      type: String,
      enum: ["cargue", "cambio_manual"],
      required: true,
      default: "cambio_manual",
    },
    /** Email o identificador del usuario que realizó el cambio. */
    cambiadoPor: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { timestamps: true }
);

schema.index({ estudianteHabilitado: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

export default mongoose.model(
  "EstudianteHabilitadoEstadoLog",
  schema,
  "estudiantes_habilitados_estado_log"
);
