/**
 * Programa finalizado del perfil. tenant-1.sql `profile_graduate_program` (líneas ~2220-2231).
 * profile_id → postulant_profile(id), program_id → program(id), etc.
 *
 * Discriminación:
 * - programFacultyId definido: formación finalizada en la Universidad del Rosario (vinculación facultad/programa UR).
 * - programFacultyId null: formación académica finalizada en otras instituciones (nombre de programa libre en externalProgramName y/o programId del catálogo legado).
 */
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "PostulantProfile", required: true, index: true },
    mysqlId: { type: Number, unique: true, sparse: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program" },
    /** Nombre del programa cuando no está en el catálogo UR (otras instituciones). */
    externalProgramName: { type: String, trim: true, maxlength: 400 },
    programFacultyId: { type: mongoose.Schema.Types.ObjectId, ref: "ProgramFaculty" },
    title: { type: String },
    endDate: { type: Date },
    university: { type: mongoose.Schema.Types.ObjectId, ref: "items" },
    anotherUniversity: { type: String },
    countryId: { type: mongoose.Schema.Types.ObjectId, ref: "Country" },
    stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
  },
  { timestamps: true }
);

schema.index({ profileId: 1 });
// Solo aplica unicidad cuando hay programId (varias filas externas con programId null son válidas).
schema.index(
  { profileId: 1, programId: 1 },
  { unique: true, partialFilterExpression: { programId: { $exists: true, $ne: null } } }
);
export default mongoose.model("ProfileGraduateProgram", schema, "profile_graduate_program");
