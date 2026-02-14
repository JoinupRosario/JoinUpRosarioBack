/**
 * Logro/premio del perfil. tenant-1.sql `profile_awards` (líneas ~2168-2179).
 * profile_id → postulant_profile(id), award_type → item(id).
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    mysqlId: { type: Number, unique: true, sparse: true },
    awardType: { type: mongoose.Schema.Types.ObjectId, ref: "items", required: true },
    description: { type: String },
    name: { type: String, required: true },
    awardDate: { type: Date },
    dateCreation: { type: Date, required: true },
    userCreator: { type: String, required: true },
    dateUpdate: { type: Date },
    userUpdater: { type: String },
  },
  { timestamps: true }
);

schema.index({ profileId: 1 });
export default mongoose.model("ProfileAward", schema, "profile_awards");
