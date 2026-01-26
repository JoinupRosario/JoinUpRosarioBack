import mongoose from "mongoose";

const postulant_practice_programSchema = new mongoose.Schema({
  postulant_practice: {
    type: mongoose.Types.ObjectId,
    ref: "access_postulant_practice",
    required: true
  },

  program_faculty_id: { type: Number, required: true }

}, { timestamps: true });

export default mongoose.model("postulant_practice_program", postulant_practice_programSchema);