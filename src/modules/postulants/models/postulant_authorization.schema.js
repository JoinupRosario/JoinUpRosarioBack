import mongoose from "mongoose";

const postulant_authorizationSchema = new mongoose.Schema({
  postulant_academic: {
    type: mongoose.Types.ObjectId,
    ref: "postulant_academic",
    required: true
  },

  authorization_id: { type: Number },
  authorized_program_code: { type: String, required: true },
  authorized_program_name: { type: String },
  period: { type: String, required: true },
  status: { type: String, required: true },
  created_at: { type: Date}
 
}, { timestamps: true });

export default mongoose.model("postulant_authorization", postulant_authorizationSchema);