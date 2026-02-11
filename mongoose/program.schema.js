import mongoose from "mongoose";

/**
 * Programa académico (ej. Ingeniería de Sistemas, Medicina).
 * En MySQL: tabla `program` (PK: id).
 * Centraliza todos los programas; la relación con facultades está en program_faculty.
 */
const programSchema = new mongoose.Schema(
  {
    mysqlId: { type: Number, unique: true, sparse: true }, // id en MySQL (legacy)
    code: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    status: { type: String, default: "active" },
  },
  { timestamps: true }
);

programSchema.index({ code: 1 });
programSchema.index({ mysqlId: 1 });

export default mongoose.model("program", programSchema);
