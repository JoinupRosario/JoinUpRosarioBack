import mongoose from "mongoose";

/**
 * RQ04_HU010 — Certificación práctica/pasantía (entidad y/o coordinación).
 * Documento asociado a la postulación y perfil del estudiante; alertas por plazo.
 */
const certificacionPracticaSchema = new mongoose.Schema(
  {
    postulacionOportunidad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionOportunidad",
      required: true,
      unique: true,
      index: true,
    },
    postulantProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulantProfile",
      default: null,
      index: true,
    },
    estado: {
      type: String,
      enum: ["pendiente_solicitud", "pendiente_carga", "cargada", "vencida_sin_carga"],
      default: "pendiente_solicitud",
      index: true,
    },
    /** Fecha fin de práctica (snapshot desde oportunidad) */
    fechaFinPractica: { type: Date, default: null },
    /** Días hábiles/parametrizados para cargar tras el fin (default env) */
    diasLimiteCarga: { type: Number, default: 15, min: 1, max: 365 },
    fechaLimiteCarga: { type: Date, default: null, index: true },
    tokenCargaEntidad: { type: String, trim: true, unique: true, sparse: true, index: true },
    solicitudEnviadaAt: { type: Date, default: null },
    alertaVencimientoEnviadaAt: { type: Date, default: null },
    documento: {
      key: { type: String, default: null },
      originalName: { type: String, default: null },
      contentType: { type: String, default: null },
      size: { type: Number, default: null },
      uploadedAt: { type: Date, default: null },
      origen: { type: String, trim: true, default: "" },
    },
    /** HU010: registro opcional de vinculación laboral con la entidad */
    vinculacionLaboral: { type: Boolean, default: false },
    vinculacionLaboralAt: { type: Date, default: null },
    vinculacionLaboralPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("CertificacionPractica", certificacionPracticaSchema, "certificaciones_practica");
