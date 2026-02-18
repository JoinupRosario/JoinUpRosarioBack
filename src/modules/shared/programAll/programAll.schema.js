/**
 * Catálogo de programas (tabla MySQL program_all, tenant-1.sql).
 * Estructura: id, code, name, level, label_level, status, type_practice_id (FK item), auditoría.
 * type_practice_id en MySQL referencia item(id).
 */
import mongoose from "mongoose";

const programAllSchema = new mongoose.Schema(
  {
    mysqlId: { type: Number, unique: true, sparse: true },
    code: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    level: { type: String, trim: true, default: "" },
    labelLevel: { type: String, trim: true },
    status: { type: String },
    typePractice: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    dateCreation: { type: Date },
    userCreator: { type: String },
    dateUpdate: { type: Date },
    userUpdater: { type: String },
  },
  { timestamps: true }
);

programAllSchema.index({ mysqlId: 1 });
programAllSchema.index({ name: 1 });
programAllSchema.index({ level: 1 });

export default mongoose.model("ProgramAll", programAllSchema, "program_alls");
