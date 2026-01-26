import mongoose from "mongoose";

const postulantLogDocumentSchema = new mongoose.Schema({
  postulant: {
    type: mongoose.Types.ObjectId,
    ref: "postulants",
    required: true
  },

  document_type: {
    type: String,
    enum: ["cv", "certificate", "other"],
    required: true
  },

  file_url: { type: String },
  content: { type: String },

  observations: { type: String },

  created_by: {
    type: mongoose.Types.ObjectId,
    ref: "User"
  }

}, { timestamps: true });

export default mongoose.model(
  "postulant_log_documents",
  postulantLogDocumentSchema
);
