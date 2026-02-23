import mongoose from "mongoose";

const historialEstadoSchema = new mongoose.Schema(
  {
    estadoAnterior: { type: String },
    estadoNuevo: { type: String, required: true },
    cambiadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fechaCambio: { type: Date, default: Date.now },
    motivo: { type: String, default: null }
  },
  { _id: false }
);

const oportunidadMTMSchema = new mongoose.Schema(
  {
    // Empresa (siempre Universidad del Rosario)
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null
    },

    // Campos básicos del formulario (HU03)
    nombreCargo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250
    },

    // Parámetros desde Items (se guarda el _id del Item)
    dedicacionHoras: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      default: null
    },
    valorPorHora: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      default: null
    },
    tipoVinculacion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      default: null
    },
    categoria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      default: null
    },

    // Periodo académico (tipo: 'monitoria', estado: 'Activo')
    periodo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Periodo",
      default: null
    },

    // Datos cuantitativos
    vacantes: {
      type: Number,
      default: null,
      min: 1
    },
    fechaVencimiento: {
      type: Date,
      default: null
    },

    // Asignaturas (máx 3, no obligatorio)
    asignaturas: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Asignatura" }],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 3,
        message: "Se pueden seleccionar máximo 3 asignaturas"
      }
    },

    // Promedio mínimo requerido
    promedioMinimo: {
      type: Number,
      default: null,
      min: 0,
      max: 5
    },

    // Información del responsable / ofertante
    nombreProfesor: {
      type: String,
      trim: true,
      default: null
    },
    unidadAcademica: {
      type: String,
      trim: true,
      default: null
    },
    horario: {
      type: String,
      trim: true,
      default: null
    },
    grupo: {
      type: String,
      trim: true,
      default: null
    },

    // Programas a los que puede pertenecer el candidato (multi-select)
    programas: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Program" }],
      default: []
    },

    // Descripción de la oferta
    funciones: {
      type: String,
      maxlength: 250,
      default: null
    },
    requisitos: {
      type: String,
      maxlength: 250,
      default: null
    },

    // Estado con flujo: Borrador → Activa → Inactiva
    estado: {
      type: String,
      enum: ["Borrador", "Activa", "Inactiva"],
      default: "Borrador"
    },

    // Historial de cambios de estado
    historialEstados: {
      type: [historialEstadoSchema],
      default: []
    },

    // Auditoría
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    actualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

// Índices para búsquedas eficientes
oportunidadMTMSchema.index({ estado: 1 });
oportunidadMTMSchema.index({ periodo: 1 });
oportunidadMTMSchema.index({ categoria: 1 });
oportunidadMTMSchema.index({ creadoPor: 1 });
oportunidadMTMSchema.index({ nombreCargo: "text" });

export default mongoose.model("OportunidadMTM", oportunidadMTMSchema);
