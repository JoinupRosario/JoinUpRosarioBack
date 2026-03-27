import mongoose from "mongoose";

/**
 * Catálogo global de variables reutilizables para plantillas de notificación.
 * En el cuerpo de la plantilla se usan con el formato [key].
 * Ej: key "NOMBRE_POSTULANTE" → en plantilla: [NOMBRE_POSTULANTE]
 */
const notificationVariableSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
      unique: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    descripcion: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    categoria: {
      type: String,
      trim: true,
      maxlength: 60,
      default: null,
    },
  },
  { timestamps: true }
);

/** key ya tiene unique: true en el campo (índice único); no duplicar con schema.index */
notificationVariableSchema.index({ categoria: 1 });

export default mongoose.model("NotificationVariable", notificationVariableSchema);
