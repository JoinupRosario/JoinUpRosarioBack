import mongoose from "mongoose";
const schema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
  /** Si existe, el ítem pertenece a esta versión de perfil; si no, al perfil base. */
  profileVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "ProfileProfileVersion", default: null, index: true },
  mysqlId: { type: Number, unique: true, sparse: true },
  area: { type: mongoose.Schema.Types.ObjectId, ref: "items", required: true },
  dateCreation: { type: Date, required: true },
  userCreator: { type: String, required: true },
  dateUpdate: Date,
  userUpdater: String,
}, { timestamps: true });
schema.index({ profileId: 1 });
schema.index({ profileId: 1, profileVersionId: 1 });
export default mongoose.model("ProfileInterestArea", schema, "profile_interest_areas");
