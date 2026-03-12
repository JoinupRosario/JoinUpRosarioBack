import mongoose from "mongoose";

/**
 * Catálogo de destinatarios posibles para una notificación.
 * Según el documento: estudiantes, líderes de práctica, coordinadores, profesores/responsables MTM,
 * y de los eventos: Postulantes, Administradores, Monitor académico, etc.
 */
const destinatarioNotificacionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 50,
      unique: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    descripcion: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    orden: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

destinatarioNotificacionSchema.index({ key: 1 }, { unique: true });
destinatarioNotificacionSchema.index({ orden: 1 });

export default mongoose.model("DestinatarioNotificacion", destinatarioNotificacionSchema);
