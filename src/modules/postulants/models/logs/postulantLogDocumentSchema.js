import mongoose from "mongoose";

/**
 * Log de creación de documentos (equivalente a document_creation_log en MySQL).
 * Migración: tenant-1.document_creation_log → esta colección (por mysqlId).
 */
const postulantLogDocumentSchema = new mongoose.Schema(
  {
    /** ID en MySQL (document_creation_log.id) para migración idempotente. */
    mysqlId: { type: Number, unique: true, sparse: true },
    postulant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Postulant",
      required: true,
    },
    /** Tipo de documento (MySQL: varchar(25)). */
    document_type: { type: String, required: true },
    file_url: { type: String },
    content: { type: String, maxlength: 500 },
    observations: { type: String, maxlength: 256 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

postulantLogDocumentSchema.index({ mysqlId: 1 });

export default mongoose.model("postulant_log_documents", postulantLogDocumentSchema);
