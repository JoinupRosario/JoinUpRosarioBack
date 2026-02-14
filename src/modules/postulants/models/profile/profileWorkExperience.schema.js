/**
 * Experiencia laboral del perfil. tenant-1.sql `profile_work_experiences` (líneas ~2413-2435).
 * profile_id → postulant_profile(id), company_sector → item(id), country/state/city → location.
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    mysqlId: { type: Number, unique: true, sparse: true },
    experienceType: { type: String, default: "JOB_EXP" },
    profileText: { type: String },
    companyName: { type: String },
    companySector: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    jobTitle: { type: String },
    profession: { type: String },
    contact: { type: String },
    achievements: { type: String },
    activities: { type: String },
    investigationLine: { type: String },
    course: { type: String },
    countryId: { type: mongoose.Schema.Types.ObjectId, ref: "Country" },
    stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
    startDate: { type: Date },
    endDate: { type: Date },
    noEndDate: { type: Boolean },
    creationDate: { type: Date, required: true },
    updateDate: { type: Date },
  },
  { timestamps: true }
);

schema.index({ profileId: 1 });
export default mongoose.model("ProfileWorkExperience", schema, "profile_work_experiences");
