/**
 * Programa finalizado del perfil. tenant-1.sql `profile_graduate_program` (líneas ~2220-2231).
 * profile_id → postulant_profile(id), program_id → program(id), etc.
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    mysqlId: { type: Number, unique: true, sparse: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program", required: true },
    programFacultyId: { type: mongoose.Schema.Types.ObjectId, ref: "ProgramFaculty" },
    title: { type: String },
    endDate: { type: Date },
    university: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    anotherUniversity: { type: String },
    countryId: { type: mongoose.Schema.Types.ObjectId, ref: "Country" },
    stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
  },
  { timestamps: true }
);

schema.index({ profileId: 1 });
schema.index({ profileId: 1, programId: 1 }, { unique: true });
export default mongoose.model("ProfileGraduateProgram", schema, "profile_graduate_program");
