/**
 * Documento soporte del perfil (tabla puente). tenant-1.sql `profile_supports`. profile_id → postulant_profile(id), attachment_id → attachment(id).
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Attachment", required: true },
  },
  { timestamps: false }
);

schema.index({ profileId: 1 });
export default mongoose.model("ProfileSupport", schema, "profile_supports");
