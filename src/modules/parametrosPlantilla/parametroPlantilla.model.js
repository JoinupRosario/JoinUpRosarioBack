import mongoose from "mongoose";

const parametroPlantillaSchema = new mongoose.Schema(
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
      index: true,
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
    ], // opcional; si no viene, el front puede usar una lista por defecto por tipo
  },
  { timestamps: true }
);

// Un mismo value puede repetirse solo si cambia el tipo (ej. aceptacion_oferta en practica y en monitoria)
parametroPlantillaSchema.index({ value: 1, tipo: 1 }, { unique: true });
parametroPlantillaSchema.index({ tipo: 1 });

export default mongoose.model("ParametroPlantilla", parametroPlantillaSchema);
