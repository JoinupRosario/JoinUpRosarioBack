import mongoose from "mongoose";
// Registrar Attachment antes de usarlo en ref.
import "../../../shared/attachment/attachment.schema.js";
/** Tabla puente profile_cv: profile_id, attachment_id. Opcionalmente profileVersionId para asociar la HV a una versión del perfil. */
const schema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
  attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Attachment", required: true },
  profileVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "ProfileProfileVersion", default: null, index: true },
}, { timestamps: false });
schema.index({ profileId: 1 });
schema.index({ profileId: 1, profileVersionId: 1 });
export default mongoose.model("ProfileCv", schema, "profile_cv");
