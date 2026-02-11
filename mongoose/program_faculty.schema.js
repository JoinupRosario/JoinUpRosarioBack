import mongoose from "mongoose";

/**
 * Relación programa–facultad: un programa se ofrece en una facultad.
 * En MySQL: tabla `program_faculty` (PK: program_faculty_id).
 * Centraliza la relación N:M entre programas y facultades; otras tablas
 * referencian program_faculty_id para no duplicar datos.
 */
const programFacultySchema = new mongoose.Schema(
  {
    program_faculty_id: { type: Number, unique: true }, // PK legacy en MySQL
    program_id: { type: Number }, // FK legacy a program.id
    faculty_id: { type: Number }, // FK legacy a faculty.faculty_id
    // Refs Mongoose (opcionales, para populate después de migrar)
    program: { type: mongoose.Schema.Types.ObjectId, ref: "program" },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: "faculty" },
  },
  { timestamps: true }
);

programFacultySchema.index({ program_faculty_id: 1 });
programFacultySchema.index({ program_id: 1, faculty_id: 1 });

export default mongoose.model("program_faculty", programFacultySchema);
