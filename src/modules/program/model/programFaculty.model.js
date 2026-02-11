import mongoose from "mongoose";

/**
 * Modelo de dominio: Relación Programa–Facultad (N:M).
 * Estructura según tenant-1.sql (tabla program_faculty).
 * mysqlId: PK de la tabla MySQL program_faculty (program_faculty_id), para referencias en migraciones.
 */
const programFacultySchema = new mongoose.Schema(
  {
    /** Clave primaria de la tabla MySQL program_faculty (para migraciones y FKs de otras tablas). */
    mysqlId: { 
      type: Number, 
      unique: true, 
      sparse: true 
    },
    programFacultyId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    /** Ref al programa. */
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
    },
    /** ID programa en MySQL (para fallback cuando programId no está resuelto). */
    program_id: { type: Number, default: null },
    /** Ref a la facultad. */
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
    },
    /** ID facultad en MySQL (para fallback cuando facultyId no está resuelto). */
    faculty_id: { type: Number, default: null },
    code: { 
      type: String, 
      trim: true 
    },
    snies: { 
      type: String, 
      trim: true 
    },
    costCentre: { 
      type: String, 
      trim: true 
    },
    officialRegistration: { 
      type: String, 
      trim: true 
    },
    practiceDuration: { 
      type: String, 
      trim: true 
    },
    officialRegistrationDate: { 
      type: Date 
    },
    status: { 
      type: String, 
      default: "ACTIVE" 
    },
    /** HU003: Activo enum SI/NO (no provisto por UXXI). */
    activo: { 
      type: String, 
      enum: ["SI", "NO"], 
      default: "SI" 
    },
    dateCreation: { 
      type: Date 
    },
    userCreator: { 
      type: String 
    },
    dateUpdate: { 
      type: Date 
    },
    userUpdater: { 
      type: String 
    },
  },
  { timestamps: true }
);

programFacultySchema.index({ mysqlId: 1 });
programFacultySchema.index({ programId: 1 });
programFacultySchema.index({ facultyId: 1 });
programFacultySchema.index({ code: 1, facultyId: 1 });

export default mongoose.model("ProgramFaculty", programFacultySchema, "program_faculties");
