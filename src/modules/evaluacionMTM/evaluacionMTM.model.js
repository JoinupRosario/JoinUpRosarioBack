import mongoose from "mongoose";

/**
 * Instancia de evaluación por LegalizacionMTM (RQ04_HU011, paso 16 del flujo GuiARTE).
 * Se crea cuando el monitor solicita la finalización (paso 15) y dispara los 3 correos:
 *   - autoevaluación del monitor
 *   - evaluación del profesor responsable
 *   - evaluación de cada estudiante asistente
 *
 * Una sola evaluación por legalización (unique).
 * Mantiene un snapshot inmutable del SurveyMTM activo al momento del disparo
 * para que los actores siempre respondan el formulario que existía en ese momento.
 */

const surveyMTMSnapshotSchema = new mongoose.Schema(
  {
    nombre: { type: String, default: "" },
    descripcion: { type: String, default: "" },
    monitor_form: { type: mongoose.Schema.Types.Mixed, default: null },
    student_form: { type: mongoose.Schema.Types.Mixed, default: null },
    teacher_form: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const evaluacionMTMSchema = new mongoose.Schema(
  {
    legalizacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LegalizacionMTM",
      required: true,
      unique: true,
      index: true,
    },
    postulacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionMTM",
      required: true,
      index: true,
    },
    oportunidadMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OportunidadMTM",
      required: true,
      index: true,
    },
    /** Plantilla origen (referencia para trazabilidad) */
    survey: { type: mongoose.Schema.Types.ObjectId, ref: "SurveyMTM", required: true },
    /** Snapshot inmutable de la plantilla en el momento del disparo */
    surveySnapshot: { type: surveyMTMSnapshotSchema, default: () => ({}) },
    estado: {
      type: String,
      enum: ["creada", "enviada", "parcial", "completa", "cerrada"],
      default: "creada",
      index: true,
    },
    /** Total de tokens de estudiante creados en el disparo */
    totalEstudiantesEsperados: { type: Number, default: 0 },
    /** Cuántos estudiantes ya respondieron (denormalizado para listados) */
    totalEstudiantesRespondidos: { type: Number, default: 0 },
    /** Marca de tiempo cuando el monitor completa su autoevaluación (clave para finalizarMTM) */
    monitorRespondidoAt: { type: Date, default: null },
    profesorRespondidoAt: { type: Date, default: null },
    disparadaPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    enviadaAt: { type: Date, default: null },
    cerradaAt: { type: Date, default: null },
  },
  { timestamps: true }
);

evaluacionMTMSchema.index({ oportunidadMTM: 1, estado: 1 });

export default mongoose.model(
  "EvaluacionMTM",
  evaluacionMTMSchema,
  "evaluaciones_mtm"
);
