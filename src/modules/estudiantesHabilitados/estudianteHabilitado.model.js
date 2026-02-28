import mongoose from "mongoose";

/**
 * Estudiante habilitado para prácticas (RQ02_HU006).
 * Generado por el proceso de carga UXXI: descarga el archivo cargue_postulantes via SFTP,
 * filtra por programa, consulta getInfoacademica y evalúa reglas curriculares.
 */
const estudianteHabilitadoSchema = new mongoose.Schema(
  {
    // ── Relación con Postulant/User ──────────────────────────────────────────
    /** Referencia al Postulant (puede ser null si el estudiante no existe aún en la BD). */
    postulant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Postulant",
      default: null,
    },
    /** Referencia directa al User (para búsqueda rápida por código). */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Datos del estudiante (del archivo UXXI) ──────────────────────────────
    identificacion:   { type: String, required: true, trim: true, index: true },
    correo:           { type: String, trim: true },
    nombres:          { type: String, trim: true },
    apellidos:        { type: String, trim: true },

    // ── Datos académicos / práctica ──────────────────────────────────────────
    /** Code del ProgramFaculty (ej. "AE02"). */
    codigoPrograma:   { type: String, trim: true },
    /** Nombre del programa. */
    nombrePrograma:   { type: String, trim: true },
    /** Referencia al ProgramFaculty seleccionado en el modal. */
    programaFacultad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProgramFaculty",
      default: null,
    },
    /** Referencia al Periodo académico. */
    periodo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Periodo",
      default: null,
    },
    /** Código del periodo (ej. "20261") para referencia rápida. */
    codigoPeriodo:    { type: String, trim: true },
    /** Tipo de práctica (Item). */
    tipoPractica: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      default: null,
    },
    /** Sede/sucursal donde aplica. */
    sede: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sucursal",
      default: null,
    },

    // ── Estado curricular ────────────────────────────────────────────────────
    /**
     * AUTORIZADO: cumple todas las reglas.
     * NO_AUTORIZADO: no cumple alguna regla.
     * EN_REVISION: sin reglas activas configuradas o excluido manualmente.
     * EXCLUIDO: en lista de exclusión (internacionalización, etc.).
     */
    estadoCurricular: {
      type: String,
      enum: ["AUTORIZADO", "NO_AUTORIZADO", "EN_REVISION", "EXCLUIDO"],
      default: "EN_REVISION",
      index: true,
    },
    /**
     * Estado final que puede ser modificado por el usuario radicador.
     * Por defecto igual a estadoCurricular.
     */
    estadoFinal: {
      type: String,
      enum: ["AUTORIZADO", "NO_AUTORIZADO", "EN_REVISION", "EXCLUIDO"],
      default: "EN_REVISION",
    },

    // ── Detalle de evaluación ────────────────────────────────────────────────
    /** Reglas curriculares que se evaluaron. */
    reglasEvaluadas: [
      {
        reglaId:     { type: mongoose.Schema.Types.ObjectId, ref: "CondicionCurricular" },
        reglaNombre: { type: String },
        logica:      { type: String, enum: ["AND", "OR"] },
        cumple:      { type: Boolean },
        detalle: [
          {
            variable: String,
            operador: String,
            valorEsperado: mongoose.Schema.Types.Mixed,
            valorReal:     mongoose.Schema.Types.Mixed,
            cumple:        Boolean,
          },
        ],
      },
    ],

    /** Snapshot de los datos académicos obtenidos de OSB para este plan. */
    datosAcademicos: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Metadata del cargue ──────────────────────────────────────────────────
    /** Email del usuario que realizó el cargue. */
    cargadoPor:  { type: String, trim: true },
    /** Fecha del cargue. */
    fechaCargue: { type: Date, default: Date.now },

    // ── Override manual (usuario radicador) ──────────────────────────────────
    radicadorOverride:     { type: Boolean, default: false },
    radicadorNota:         { type: String, trim: true },
    radicadorUser:         { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    radicadorFecha:        { type: Date, default: null },
  },
  { timestamps: true }
);

// Índice compuesto: un estudiante no se duplica por identificación + periodo + programa
estudianteHabilitadoSchema.index(
  { identificacion: 1, periodo: 1, codigoPrograma: 1 },
  { unique: true }
);

export default mongoose.model(
  "EstudianteHabilitado",
  estudianteHabilitadoSchema,
  "estudiantes_habilitados"
);
