/**
 * Documento soporte del perfil (tabla puente). tenant-1.sql `profile_supports`. profile_id → postulant_profile(id), attachment_id → attachment(id).
 */
import mongoose from "mongoose";
// Registrar Attachment antes de usarlo en ref.
import "../../../shared/attachment/attachment.schema.js";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Attachment", required: true },
    /** Nombre que el postulante asocia al archivo (ej. "Cédula de ciudadanía"). */
    documentLabel: { type: String, trim: true, maxlength: 200, default: "" },
  },
  { timestamps: false }
);

schema.index({ profileId: 1 });
export default mongoose.model("ProfileSupport", schema, "profile_supports");
