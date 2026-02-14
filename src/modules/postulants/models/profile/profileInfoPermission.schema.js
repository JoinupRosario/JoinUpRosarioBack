import mongoose from "mongoose";
/** profile_info_permissions. tenant-1.sql */
const schema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
  permission: String,
}, { timestamps: false });
schema.index({ profileId: 1 });
export default mongoose.model("ProfileInfoPermission", schema, "profile_info_permissions");
