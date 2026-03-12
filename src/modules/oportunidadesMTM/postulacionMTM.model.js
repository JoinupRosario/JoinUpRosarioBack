import mongoose from "mongoose";

/**
 * RQ04_HU001: Postulación de un estudiante (postulante) a una oportunidad MTM.
 * Relaciona postulante + oportunidad MTM + perfil (HV) con la que aplicó y estado del proceso.
 */
const postulacionMTMSchema = new mongoose.Schema(
  {
    postulant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Postulant",
      required: true,
      index: true,
    },
    oportunidadMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OportunidadMTM",
      required: true,
      index: true,
    },
    /** Perfil (hoja de vida) con la que el estudiante se postuló */
    postulantProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulantProfile",
      required: true,
    },
    profileVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProfileProfileVersion",
      default: null,
    },
    /** Estado: aplicado → empresa_consulto_perfil | empresa_descargo_hv | seleccionado_empresa | aceptado_estudiante | rechazado */
    estado: {
      type: String,
      enum: [
        "aplicado",
        "empresa_consulto_perfil",
        "empresa_descargo_hv",
        "seleccionado_empresa",
        "aceptado_estudiante",
        "rechazado",
      ],
      default: "aplicado",
      index: true,
    },
    /** Cuando se cierra la oportunidad: confirmado si fue seleccionado, rechazado si no */
    estadoConfirmacion: {
      type: String,
      enum: ["confirmado", "rechazado"],
      default: null,
    },
    fechaAplicacion: { type: Date, default: Date.now },
    empresaConsultoPerfilAt: { type: Date, default: null },
    empresaDescargoHvAt: { type: Date, default: null },
    seleccionadoAt: { type: Date, default: null },
    aceptadoEstudianteAt: { type: Date, default: null },
    rechazadoAt: { type: Date, default: null },
    revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    comentarios: { type: String, default: null },
  },
  { timestamps: true }
);

postulacionMTMSchema.index({ oportunidadMTM: 1, postulant: 1 }, { unique: true });
postulacionMTMSchema.index({ postulant: 1, fechaAplicacion: -1 });

export default mongoose.model(
  "PostulacionMTM",
  postulacionMTMSchema,
  "postulaciones_mtm"
);
