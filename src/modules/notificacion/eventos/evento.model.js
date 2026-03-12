import mongoose from "mongoose";

/**
 * Evento de notificación. Cada evento dispara una notificación y tiene una plantilla asociada.
 * Colección en MongoDB: eventos
 */
const eventoSchema = new mongoose.Schema(
  {
    value: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    tipo: {
      type: String,
      required: true,
      enum: ["practica", "monitoria", "general"],
    },
    nombre: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    // Variables que el sistema reemplazará al enviar el correo para esta plantilla
    variables: [
      {
        variable: { type: String, trim: true, maxlength: 80 },
        desc: { type: String, trim: true, maxlength: 120 },
      },
    ],
  },
  { timestamps: true }
);

eventoSchema.index({ value: 1, tipo: 1 }, { unique: true });
eventoSchema.index({ tipo: 1 });

// Modelo "Evento" → colección "eventos" en MongoDB
export default mongoose.model("Evento", eventoSchema, "eventos");
