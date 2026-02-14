import mongoose from "mongoose";
/** profile_enrolled_program. tenant-1.sql */
const schema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
  mysqlId: { type: Number, unique: true, sparse: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program", required: true },
  programFacultyId: { type: mongoose.Schema.Types.ObjectId, ref: "ProgramFaculty" },
  university: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
  anotherUniversity: String,
  countryId: { type: mongoose.Schema.Types.ObjectId, ref: "Country" },
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
  cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
  dateCreation: { type: Date, required: true },
  userCreator: { type: String, required: true },
  dateUpdate: Date,
  userUpdater: String,
}, { timestamps: true });
schema.index({ profileId: 1 });
export default mongoose.model("ProfileEnrolledProgram", schema, "profile_enrolled_program");
