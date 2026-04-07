import mongoose from "mongoose";
import {
  POSTULACION_ESTADOS,
  DEFAULT_POSTULACION_ESTADO,
} from "../../constants/domainEstados.js";

/**
 * RQ04_HU002: Postulación de un postulante (estudiante) a una oportunidad de práctica/pasantía.
 * Relaciona postulante + oportunidad + perfil (hoja de vida) con la que aplicó y estado del proceso.
 */
const postulacionOportunidadSchema = new mongoose.Schema(
  {
    postulant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Postulant",
      required: true,
      index: true,
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Opportunity",
      required: true,
      index: true,
    },
    /** Perfil (hoja de vida) con la que el estudiante se postuló */
    postulantProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulantProfile",
      required: true,
    },
    /** Versión del perfil (profile_profile_version) con la que aplicó; opcional. Si existe, las HV mostradas se filtran por esta versión. */
    profileVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProfileProfileVersion",
      default: null,
    },
    /** Estado principal del flujo: aplicado → empresa_consulto_perfil | empresa_descargo_hv | seleccionado_empresa | aceptado_estudiante | rechazado */
    estado: {
      type: String,
      enum: POSTULACION_ESTADOS,
      default: DEFAULT_POSTULACION_ESTADO,
      index: true,
    },
    fechaAplicacion: {
      type: Date,
      default: Date.now,
    },
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

postulacionOportunidadSchema.index({ opportunity: 1, postulant: 1 }, { unique: true });

export default mongoose.model(
  "PostulacionOportunidad",
  postulacionOportunidadSchema,
  "postulaciones_oportunidad"
);
