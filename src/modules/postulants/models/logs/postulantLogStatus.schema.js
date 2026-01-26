import mongoose from "mongoose";

const postulantLogStatusSchema = new mongoose.Schema({
  postulant: {
    type: mongoose.Types.ObjectId,
    ref: "postulants",
    required: true
  },

  status_before: { type: String },
  status_after: { type: String, required: true },

  reason: { type: String },

  changed_by: {
    type: mongoose.Types.ObjectId,
    ref: "User"
  },

  user_type: { type: String }

}, { timestamps: true });

export default mongoose.model(
  "postulant_log_status",
  postulantLogStatusSchema
);
