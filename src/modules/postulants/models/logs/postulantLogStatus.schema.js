import mongoose from "mongoose";

/**
 * Log de cambio de estado del postulante (equivalente a change_status_user en MySQL).
 * Migración: tenant-1.change_status_user → esta colección (por mysqlId).
 */
const postulantLogStatusSchema = new mongoose.Schema(
  {
    /** ID en MySQL (change_status_user.id) para migración idempotente. */
    mysqlId: { type: Number, unique: true, sparse: true },
    postulant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Postulant",
      required: true,
    },
    status_before: { type: String },
    status_after: { type: String, required: true },
    reason: { type: String },
    changed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    user_type: { type: String },
  },
  { timestamps: true }
);

postulantLogStatusSchema.index({ mysqlId: 1 });

export default mongoose.model("postulant_log_status", postulantLogStatusSchema);
