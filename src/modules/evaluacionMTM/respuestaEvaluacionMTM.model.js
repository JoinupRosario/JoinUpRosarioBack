import mongoose from "mongoose";

/**
 * Respuestas concretas que envía un actor al evaluar.
 * Una respuesta = una entrega completa del formulario por parte de un actor (token).
 */

const itemRespuestaSchema = new mongoose.Schema(
  {
    /** _id de la pregunta dentro del snapshot del formulario */
    preguntaId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Texto de la pregunta (denormalizado para reportes históricos) */
    preguntaTexto: { type: String, default: "" },
    tipo: { type: String, default: "" },
    /** Valor enviado: string para texto/fecha, number para escala/numero, array para opcion_multiple */
    valor: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Peso usado en el cálculo (copiado del snapshot) */
    peso: { type: Number, default: 1 },
  },
  { _id: false }
);

const respuestaEvaluacionMTMSchema = new mongoose.Schema(
  {
    evaluacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EvaluacionMTM",
      required: true,
      index: true,
    },
    accessToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EvaluacionAccessToken",
      required: true,
      unique: true,
      index: true,
    },
    actor: {
      type: String,
      enum: ["monitor", "profesor", "estudiante"],
      required: true,
      index: true,
    },
    identificadorActor: { type: String, required: true, trim: true, maxlength: 100 },
    nombreActor: { type: String, default: "", trim: true, maxlength: 300 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 200 },
    respuestas: { type: [itemRespuestaSchema], default: [] },
    /** Promedio ponderado opcional (sum(valor*peso)/sum(peso)) sobre preguntas numéricas */
    puntajePonderado: { type: Number, default: null },
    completadaAt: { type: Date, default: Date.now },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

respuestaEvaluacionMTMSchema.index({ evaluacionMTM: 1, actor: 1 });

export default mongoose.model(
  "RespuestaEvaluacionMTM",
  respuestaEvaluacionMTMSchema,
  "respuestas_evaluacion_mtm"
);
