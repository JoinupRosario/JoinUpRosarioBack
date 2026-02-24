import mongoose from "mongoose";

/**
 * Configuración de parametrización de documentos (ej. hoja de vida).
 * Un documento por tipo (hoja_vida). Logo y formato se guardan para la generación del PDF.
 */
const formatSeccionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const documentParametrizationSchema = new mongoose.Schema(
  {
    /** Tipo de documento: hoja_vida, etc. */
    type: {
      type: String,
      required: true,
      unique: true,
      enum: ["hoja_vida"],
    },
    /** Logo en base64 (data URL o solo base64) para el encabezado del PDF. */
    logoBase64: { type: String, default: null },
    /** Orden y visibilidad de secciones en el PDF. */
    formatSecciones: {
      type: [formatSeccionSchema],
      default: [],
    },
    /** Campos obligatorios: { [sectionKey]: true } para diligenciamiento obligatorio. */
    camposObligatorios: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

documentParametrizationSchema.index({ type: 1 });

export default mongoose.model(
  "DocumentParametrization",
  documentParametrizationSchema,
  "document_parametrizations"
);
