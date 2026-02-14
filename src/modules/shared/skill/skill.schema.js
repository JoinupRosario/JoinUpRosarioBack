/**
 * Habilidad/categoría. Estructura según tenant-1.sql tabla `skill` (líneas ~2618-2621).
 * id, name.
 */
import mongoose from "mongoose";

const skillSchema = new mongoose.Schema(
  {
    mysqlId: { type: Number, unique: true, sparse: true },
    name: { type: String },
  },
  { timestamps: false }
);

skillSchema.index({ mysqlId: 1 });

export default mongoose.model("Skill", skillSchema, "skills");
