import mongoose from "mongoose";

/**
 * RQ04_HU010: Registro de asistencia a espacios MTM.
 * Cada registro = un estudiante que diligencia asistencia a una actividad/espacio del monitor.
 * El reporte incluye: código monitoría, monitor, coordinador, periodo, nombre actividad,
 * y por registro: nombres, apellidos, identificación, programa estudiante, fecha diligenciamiento.
 */
const asistenciaMTMSchema = new mongoose.Schema(
  {
    postulacionMTM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostulacionMTM",
      required: true,
      index: true,
    },
    /** Nombre de la actividad/espacio al que asiste (del plan o libre) */
    nombreActividad: { type: String, trim: true, required: true, maxlength: 300 },
    /** Datos de quien diligencia (estudiante que asiste) */
    nombresEstudiante: { type: String, trim: true, required: true, maxlength: 200 },
    apellidosEstudiante: { type: String, trim: true, required: true, maxlength: 200 },
    identificacionEstudiante: { type: String, trim: true, required: true, maxlength: 50 },
    programaEstudiante: { type: String, trim: true, default: "", maxlength: 200 },
    fechaDiligenciamiento: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

asistenciaMTMSchema.index({ postulacionMTM: 1, fechaDiligenciamiento: -1 });

export default mongoose.model("AsistenciaMTM", asistenciaMTMSchema, "asistencias_mtm");
