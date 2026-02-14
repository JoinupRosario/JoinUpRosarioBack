/**
 * Referencia personal del perfil. tenant-1.sql `profile_references`. profile_id → postulant_profile(id).
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    mysqlId: { type: Number, unique: true, sparse: true },
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    occupation: { type: String, required: true },
    phone: { type: String, required: true },
    dateCreation: { type: Date, required: true },
    userCreator: { type: String, required: true },
    dateUpdate: { type: Date },
    userUpdater: { type: String },
  },
  { timestamps: true }
);

schema.index({ profileId: 1 });
export default mongoose.model("ProfileReference", schema, "profile_references");
