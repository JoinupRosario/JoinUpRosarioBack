import mongoose from "mongoose";

const opportunity_postulantSchema = new mongoose.Schema({
  required_degree_programs: { type: String },
  required_registered_programs: { type: String },
  degree_candidate: { type: Boolean, required: true },
  has_authorized_list: { type: Boolean, required: true },
  initial_filter: { type: Boolean, required: true },
  postulant_level: { type: String, required: true },

}, { timestamps: true });

export default mongoose.model("opportunity_postulant", opportunity_postulantSchema);