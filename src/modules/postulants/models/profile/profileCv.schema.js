import mongoose from "mongoose";
/** Tabla puente profile_cv: profile_id, attachment_id. tenant-1.sql */
const schema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
  attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Attachment", required: true },
}, { timestamps: false });
schema.index({ profileId: 1 });
export default mongoose.model("ProfileCv", schema, "profile_cv");
