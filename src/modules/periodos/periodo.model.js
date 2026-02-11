import mongoose from "mongoose";

/**
 * Modelo de período académico (gestión de períodos para prácticas y monitorías).
 * Origen: tabla MySQL academic_period.
 * Campos alineados con la vista: Período (código), Estado, rangos de fechas (sistema académico,
 * inicio práctica, fecha máx. finalización, autorización, legalización, publicar ofertas).
 */
const periodoSchema = new mongoose.Schema(
  {
    /** Código o nombre del período (ej: 2024-1, 2023-1 Int). En MySQL: period */
    codigo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    /** Estado: Activo | Inactivo. En MySQL: status */
    estado: {
      type: String,
      required: true,
      trim: true,
      default: "Inactivo",
    },
    /** Rango de fechas del periodo según sistema académico */
    fechaSistemaAcademico: {
      inicio: { type: Date, default: null },
      fin: { type: Date, default: null },
    },
    /** Rango de fechas de inicio de práctica académica */
    fechaInicioPractica: {
      inicio: { type: Date, default: null },
      fin: { type: Date, default: null },
    },
    /** Fecha máxima de finalización de práctica académica */
    fechaMaxFinPractica: { type: Date, default: null },
    /** Rango de fechas de autorización para práctica */
    fechaAutorizacion: {
      inicio: { type: Date, default: null },
      fin: { type: Date, default: null },
    },
    /** Rango de legalización de práctica */
    fechaLegalizacion: {
      inicio: { type: Date, default: null },
      fin: { type: Date, default: null },
    },
    /** Rango de fechas para publicar ofertas de práctica */
    fechaPublicarOfertas: {
      inicio: { type: Date, default: null },
      fin: { type: Date, default: null },
    },
    /** PK de la tabla MySQL academic_period (para migraciones y referencias legacy). */
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

periodoSchema.index({ codigo: 1 });
periodoSchema.index({ estado: 1 });
periodoSchema.index({ mysqlId: 1 });

export default mongoose.model("Periodo", periodoSchema, "periodos");
