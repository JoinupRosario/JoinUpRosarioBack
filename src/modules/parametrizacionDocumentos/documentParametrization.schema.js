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
    /** Tipo de documento: hoja_vida, carta_presentacion (RQ04_HU003), etc. */
    type: {
      type: String,
      required: true,
      unique: true,
      enum: ["hoja_vida", "carta_presentacion"],
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
    /** Carta de presentación: imagen de firma en base64 (opcional). */
    firmaBase64: { type: String, default: null },
    /** Carta de presentación: textos del bloque de firma (nombre, cargo, unidad). La universidad se toma de la sede. */
    firmaDatos: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ nombre: "", cargo: "", unidad: "" }),
    },
    /** Carta de presentación: bloques de texto (legacy). Se prefiere textosInternos para la carta simple. */
    bloquesTexto: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, required: true },
            titulo: { type: String, default: "" },
            contenido: { type: String, default: "" },
            order: { type: Number, required: true },
            visible: { type: Boolean, default: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    /** Carta de presentación: textos internos (usted escribe). El resto se completa con datos del postulante. */
    textosInternos: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ encabezado: "", cuerpo: "", cierre: "" }),
    },
    /** Carta: si incluir fecha y cómo (fecha_actual = al generar usa fecha de hoy; fecha_elegible = el usuario elige; ninguna = no mostrar fecha). */
    opcionFechaCarta: {
      type: String,
      enum: ["fecha_actual", "fecha_elegible", "ninguna"],
      default: "fecha_actual",
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
