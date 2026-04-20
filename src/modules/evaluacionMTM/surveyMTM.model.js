import mongoose from "mongoose";

/**
 * Plantilla parametrizable para evaluaciones de MTM (RQ04_HU011).
 * El "Coordinador general de MTM" define preguntas y pesos.
 *
 * Tres sub-formularios independientes (uno por actor):
 *   - monitor_form  → autoevaluación del monitor/tutor/mentor.
 *   - student_form  → evaluación que diligencian los estudiantes asistentes.
 *   - teacher_form  → evaluación que diligencia el profesor responsable.
 *
 * Solo una SurveyMTM puede estar en estado 'activa' al tiempo (una global).
 * Cuando se dispara una evaluación se hace snapshot inmutable en EvaluacionMTM.
 */

const opcionPreguntaSchema = new mongoose.Schema(
  {
    texto: { type: String, required: true, trim: true, maxlength: 500 },
    /** Valor numérico opcional para promedios ponderados (1..5, etc.) */
    valor: { type: Number, default: null },
  },
  { _id: true }
);

const preguntaSchema = new mongoose.Schema(
  {
    texto: { type: String, required: true, trim: true, maxlength: 1000 },
    descripcion: { type: String, trim: true, default: "", maxlength: 1000 },
    tipo: {
      type: String,
      required: true,
      enum: [
        "texto",
        "textarea",
        "opcion_unica",
        "opcion_multiple",
        "escala",
        "numero",
        "fecha",
      ],
    },
    opciones: { type: [opcionPreguntaSchema], default: [] },
    /** Para tipo 'escala' */
    escalaMin: { type: Number, default: null },
    escalaMax: { type: Number, default: null },
    escalaLabelMin: { type: String, default: null, maxlength: 120 },
    escalaLabelMax: { type: String, default: null, maxlength: 120 },
    /** Peso para el promedio ponderado del reporte (default 1) */
    peso: { type: Number, default: 1, min: 0 },
    requerida: { type: Boolean, default: true },
    orden: { type: Number, default: 0 },
  },
  { _id: true }
);

const formularioSchema = new mongoose.Schema(
  {
    titulo: { type: String, default: "", trim: true, maxlength: 300 },
    descripcion: { type: String, default: "", trim: true, maxlength: 2000 },
    preguntas: { type: [preguntaSchema], default: [] },
  },
  { _id: false }
);

const surveyMTMSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 300 },
    descripcion: { type: String, default: "", trim: true, maxlength: 2000 },
    estado: {
      type: String,
      enum: ["borrador", "activa", "archivada"],
      default: "borrador",
      index: true,
    },
    /** Autoevaluación del monitor */
    monitor_form: { type: formularioSchema, default: () => ({ preguntas: [] }) },
    /** Evaluación que responden los estudiantes asistentes */
    student_form: { type: formularioSchema, default: () => ({ preguntas: [] }) },
    /** Evaluación que responde el profesor responsable */
    teacher_form: { type: formularioSchema, default: () => ({ preguntas: [] }) },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    activadaAt: { type: Date, default: null },
  },
  { timestamps: true }
);

surveyMTMSchema.index({ estado: 1, updatedAt: -1 });

export default mongoose.model("SurveyMTM", surveyMTMSchema, "surveys_mtm");
