import mongoose from "mongoose";

/**
 * Modelo de período académico (gestión de períodos para prácticas y monitorías).
 * tipo: "practica" (todos los campos) | "monitoria" (solo codigo, fechaSistemaAcademico, estado).
 *
 * Mapeo con tenant-1.sql tabla `academic_period`:
 *   mysqlId                          ← id (bigint)
 *   codigo                           ← period (varchar 100)
 *   estado                           ← status (varchar 100) → normalizado Activo/Inactivo
 *   fechaSistemaAcademico.inicio      ← date_initial_period_academic_system (datetime)
 *   fechaSistemaAcademico.fin        ← date_final_period_academic_system (datetime)
 *   fechaInicioPractica.inicio       ← date_initial_start_academic_practice (datetime)
 *   fechaInicioPractica.fin          ← date_final_start_academic_practice (datetime)
 *   fechaMaxFinPractica              ← date_max_end_practice (datetime)
 *   fechaAutorizacion.inicio         ← date_initial_approbation_practice (datetime)
 *   fechaAutorizacion.fin           ← date_final_approbation_practice (datetime)
 *   fechaLegalizacion.inicio         ← date_initial_legalization_practice (datetime)
 *   fechaLegalizacion.fin           ← date_final_legalization_practice (datetime)
 *   fechaPublicarOfertas.inicio      ← date_initial_publish_offer (datetime)
 *   fechaPublicarOfertas.fin         ← date_final_publish_offer (datetime)
 * MySQL además tiene date_initial_publish_sw, date_final_publish_sw (no usados en este modelo).
 * El campo tipo no existe en MySQL; se infiere en migración:
 * - Si solo date_initial/final_period_academic_system tienen valor y el resto de fechas son null → monitoria.
 * - Si alguna fecha de práctica/autorización/legalización/publicar tiene valor → practica.
 */
const TIPO_PERIODO = Object.freeze({ PRACTICA: "practica", MONITORIA: "monitoria" });

const periodoSchema = new mongoose.Schema(
  {
    /** practica = RQ 4.3 (todos los campos); monitoria = RQ 4.2.1 (solo período, rango sistema académico, estado). */
    tipo: {
      type: String,
      enum: Object.values(TIPO_PERIODO),
      default: TIPO_PERIODO.PRACTICA,
      trim: true,
    },
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
    /** Usuario que creó el período (log de auditoría). */
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Usuario que editó por última vez (log de auditoría). */
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

periodoSchema.index({ codigo: 1 });
periodoSchema.index({ estado: 1 });
periodoSchema.index({ tipo: 1 });
periodoSchema.index({ createdBy: 1 });
periodoSchema.index({ mysqlId: 1 });

export { TIPO_PERIODO };
export default mongoose.model("Periodo", periodoSchema, "periodos");
