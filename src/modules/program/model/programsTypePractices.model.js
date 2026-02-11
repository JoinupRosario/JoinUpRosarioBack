import mongoose from "mongoose";

/**
 * Relación programa–tipo de práctica por program_faculty.
 * Estructura según tenant-1.sql (tabla programs_type_practices).
 * mysqlId: PK de la tabla MySQL programs_type_practices (id).
 * typePractice: ref a items (item.id en MySQL).
 */
const programsTypePracticesSchema = new mongoose.Schema(
  {
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
    },
    programFaculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProgramFaculty",
    },
    typePractice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
    },
  },
  { timestamps: true }
);

programsTypePracticesSchema.index({ mysqlId: 1 });
programsTypePracticesSchema.index({ program: 1 });
programsTypePracticesSchema.index({ programFaculty: 1 });
programsTypePracticesSchema.index({ typePractice: 1 });

export default mongoose.model("ProgramsTypePractice", programsTypePracticesSchema, "programs_type_practices");
