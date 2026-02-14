/**
 * Idioma del perfil. tenant-1.sql `profile_language`. profile_id → postulant_profile(id), language/level* → item(id).
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    mysqlId: { type: Number, unique: true, sparse: true },
    language: { type: mongoose.Schema.Types.ObjectId, ref: "items", required: true },
    level: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    levelWrite: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    levelListen: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    levelRead: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    certificationExam: { type: Boolean, default: false },
    certificationExamName: { type: String },
    dateCreation: { type: Date, required: true },
    userCreator: { type: String, required: true },
    dateUpdate: { type: Date },
    userUpdater: { type: String },
  },
  { timestamps: true }
);

schema.index({ profileId: 1 });
export default mongoose.model("ProfileLanguage", schema, "profile_language");
