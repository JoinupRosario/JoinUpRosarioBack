import mongoose from "mongoose";

const postulant_practiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  period_id: { type: Number, required: true },
  faculty_id: { type: Number, required: true },
  rules: { type: String },
  status: { type: String, required: true },
  created_at: { type: Date },
  created_by: { type: String },
  updated_at: { type: Date },
  updated_by: { type: String }

}, { timestamps: true });

export default mongoose.model("postulant_practice", postulant_practiceSchema);