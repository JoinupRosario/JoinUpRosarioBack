import mongoose from "mongoose";

/**
 * Plantilla de notificación asociada a un evento (parametro_plantilla).
 * Solo una plantilla por evento puede estar activa (isActive: true).
 * En el cuerpo y asunto se usan variables del catálogo con formato [KEY].
 */
const plantillaNotificacionSchema = new mongoose.Schema(
  {
    parametroPlantillaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Evento",
      required: true,
      index: true,
    },
    asunto: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    cuerpo: {
      type: String,
      default: "",
      maxlength: 50000,
    },
    frecuencia: {
      type: String,
      required: true,
      enum: ["inmediato", "diario", "semanal"],
      default: "inmediato",
    },
    destinatarios: {
      type: [String],
      default: [],
      trim: true,
      lowercase: true,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

plantillaNotificacionSchema.index({ parametroPlantillaId: 1, isActive: 1 });

export default mongoose.model("PlantillaNotificacion", plantillaNotificacionSchema);
