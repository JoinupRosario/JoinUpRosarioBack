/**
 * Habilidad del perfil. tenant-1.sql `profile_skill`. profile_id → postulant_profile(id), skill_id → skill(id).
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    mysqlId: { type: Number, unique: true, sparse: true },
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", required: true },
    experienceYears: { type: Number, required: true },
    dateCreation: { type: Date, required: true },
    userCreator: { type: String, required: true },
    dateUpdate: { type: Date },
    userUpdater: { type: String },
  },
  { timestamps: true }
);

schema.index({ profileId: 1 });
export default mongoose.model("ProfileSkill", schema, "profile_skill");
