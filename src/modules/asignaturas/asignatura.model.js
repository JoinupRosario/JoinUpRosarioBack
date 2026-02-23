import mongoose from "mongoose";

const asignaturaSchema = new mongoose.Schema(
  {
    nivel:              { type: String, trim: true },
    periodo:            { type: String, trim: true, index: true },
    idAsignatura:       { type: String, trim: true, index: true },
    nombreAsignatura:   { type: String, trim: true },
    codDepto:           { type: String, trim: true },
    nombreDepartamento: { type: String, trim: true },
    codArea:            { type: String, trim: true },
    nombreArea:         { type: String, trim: true },
    centroBeneficio:    { type: String, trim: true },
    codAsignatura:      { type: String, trim: true },
    estado:             { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    userCreator:        { type: String, trim: true },
    userUpdater:        { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

// Clave de unicidad: periodo + idAsignatura + codArea
asignaturaSchema.index({ periodo: 1, idAsignatura: 1, codArea: 1 }, { unique: true });

export default mongoose.model("Asignatura", asignaturaSchema);
