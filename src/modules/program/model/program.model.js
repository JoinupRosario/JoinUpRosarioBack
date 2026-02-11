import mongoose from "mongoose";

/**
 * Modelo de dominio: Programa académico.
 * Estructura según tenant-1.sql (tabla program).
 * La relación con facultades está en program_faculty.
 * mysqlId: PK de la tabla MySQL `program` (id), para referencias en migraciones.
 * typePractice: ref a items (item.id en MySQL).
 */
const programSchema = new mongoose.Schema(
  {
    /** Clave primaria de la tabla MySQL program (para migraciones y FKs de otras tablas). */
    mysqlId: { 
      type: Number, 
      unique: true, 
      sparse: true 
    },
    code: { 
      type: String, 
      trim: true 
    },
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    level: { 
      type: String, 
      trim: true, 
      default: "" 
    },
    labelLevel: { 
      type: String, 
      trim: true 
    },
    status: { 
      type: String 
    },
    /** Ref al tipo de práctica (item.id en MySQL). */
    typePractice: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "items" 
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

programSchema.index({ code: 1 });
programSchema.index({ name: 1 });
programSchema.index({ status: 1 });
programSchema.index({ level: 1 });
programSchema.index({ mysqlId: 1 });

export default mongoose.model("Program", programSchema, "programs");
