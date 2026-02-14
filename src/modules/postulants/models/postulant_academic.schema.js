import mongoose from "mongoose";

const postulant_academicSchema = new mongoose.Schema({
   postulant: {
    type: mongoose.Types.ObjectId,
    ref: "Postulant",
    required: true
  },

  current_faculty_code: { type: String },
  current_faculty_name: { type: String },
  current_program_code: { type: String },
  current_program_name: { type: String },
  current_program_level: { type: String },

  finished_faculty_code: { type: String },
  finished_faculty_name: { type: String },
  finished_program_code: { type: String },
  finished_program_name: { type: String },
  finished_program_level: { type: String },

  graduation_date: { type: Date }

}, { timestamps: true });

export default mongoose.model("postulant_academic", postulant_academicSchema);