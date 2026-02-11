import mongoose from "mongoose";

/**
 * Modelo de dominio: Facultad.
 * RQ02_HU003: Código Facultad (alfanumérico), Nombre Facultad texto 255, Estado.
 * mysqlId: PK de la tabla MySQL `faculty` (faculty_id), para referencias en migraciones.
 * FKs MySQL: identification_from_signer → city.id, branch_id → branch.branch_id, identification_type_signer → item.id.
 */
const facultySchema = new mongoose.Schema(
  {
    /** Clave primaria de la tabla MySQL faculty (para migraciones y FKs de otras tablas). */
    mysqlId: { 
      type: Number, 
      unique: true, 
      sparse: true 
    },
    facultyId: { 
      type: Number, 
      unique: true, 
      sparse: true 
    },
    code: { 
      type: String, 
      required: true, 
      trim: true 
    },
    name: { 
      type: String, 
      required: true, 
      trim: true, 
      maxlength: 255 
    },
    authorizedSigner: { 
      type: String 
    },
    /** Ref al ítem tipo de identificación (fk_item_ident_type_signer). */
    identificationTypeSigner: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "items" 
    },
    identificationSigner: { 
      type: String 
    },

    /** Ref a la ciudad del firmante (fk_city_ident_from_signer). */
    identificationFromSigner: {
       type: mongoose.Schema.Types.ObjectId, 
      ref: "City" 
    },
    positionSigner: { 
      type: String 
    },
    mailSigner: { 
      type: String 
    },
    academicSigner: { 
      type: String
    },
    positionAcademicSigner: { 
      type: String 
    },
    mailAcademicSigner: { 
      type: String
    },
    /** Ref a la sede. */
    branchId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Branch"
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
    status: { 
      type: String, 
      required: true
    },
  },
  { timestamps: true }
);

facultySchema.index({ code: 1 });
facultySchema.index({ name: 1 });
facultySchema.index({ status: 1 });
facultySchema.index({ mysqlId: 1 });

export default mongoose.model("Faculty", facultySchema, "faculties");
