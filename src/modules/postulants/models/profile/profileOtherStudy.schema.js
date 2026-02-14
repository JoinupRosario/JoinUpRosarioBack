import mongoose from "mongoose";
const schema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
  mysqlId: { type: Number, unique: true, sparse: true },
  studyName: { type: String, required: true },
  studyInstitution: { type: String, required: true },
  studyYear: { type: Number, required: true },
  dateCreation: { type: Date, required: true },
  userCreator: { type: String, required: true },
  dateUpdate: Date,
  userUpdater: String,
}, { timestamps: true });
schema.index({ profileId: 1 });
export default mongoose.model("ProfileOtherStudy", schema, "profile_other_studies");
