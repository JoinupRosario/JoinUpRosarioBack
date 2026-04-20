import mongoose from "mongoose";

/**
 * Token de acceso público a una evaluación MTM (uno por actor).
 * El correo enviado al actor contiene el link `<FRONT>/evaluacion-mtm/responder/<token>`.
 * Cuando el actor envía respuestas, se marca usado=true y se persiste fecha_uso.
 */

const evaluacionAccessTokenSchema = new mongoose.Schema(
  {
    evaluacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EvaluacionMTM",
      required: true,
      index: true,
    },
    actor: {
      type: String,
      enum: ["monitor", "profesor", "estudiante"],
      required: true,
      index: true,
    },
    /**
     * Identificador del actor:
     *  - monitor / profesor → User._id
     *  - estudiante         → identificacionEstudiante (string)
     */
    identificadorActor: { type: String, required: true, trim: true, maxlength: 100 },
    /** Datos descriptivos para mostrar en la página pública / reportes */
    nombreActor: { type: String, default: "", trim: true, maxlength: 300 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 200 },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: 200,
    },
    expiraEn: { type: Date, default: null },
    usado: { type: Boolean, default: false, index: true },
    fechaUso: { type: Date, default: null },
    /** Cuántas veces se ha re-enviado el correo (para auditoría) */
    reenvios: { type: Number, default: 0 },
    ultimoReenvioAt: { type: Date, default: null },
  },
  { timestamps: true }
);

evaluacionAccessTokenSchema.index(
  { evaluacionMTM: 1, actor: 1, identificadorActor: 1 },
  { unique: true }
);

export default mongoose.model(
  "EvaluacionAccessToken",
  evaluacionAccessTokenSchema,
  "evaluacion_access_tokens_mtm"
);
