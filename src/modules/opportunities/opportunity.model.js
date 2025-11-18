import mongoose from "mongoose";

const opportunitySchema = new mongoose.Schema(
  {
    // Tipo de oportunidad
    tipo: {
      type: String,
      enum: ["practica", "monitoria"],
      required: true
    },

    // Relación con empresa
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true
    },

    // Información básica
    nombreCargo: {
      type: String,
      required: true,
      trim: true
    },

    // Auxilio económico
    auxilioEconomico: {
      type: Boolean,
      default: false
    },
    requiereConfidencialidad: {
      type: Boolean,
      default: false
    },
    apoyoEconomico: {
      type: Number,
      default: null
    },

    // Tipo de vinculación y periodo
    tipoVinculacion: {
      type: String,
      enum: [
        "contrato_laboral_nomina",
        "contrato_aprendizaje",
        "convenio_docencia_servicio",
        "acto_administrativo",
        "acuerdo_vinculacion",
        "otro_documento"
      ],
      default: null
    },
    periodo: {
      type: String,
      default: null
    },
    vacantes: {
      type: Number,
      default: null,
      min: 1
    },
    fechaVencimiento: {
      type: Date,
      default: null
    },

    // Ubicación
    pais: {
      type: String,
      default: null
    },
    ciudad: {
      type: String,
      default: null
    },

    // Jornada y dedicación
    jornadaOrdinariaSemanal: {
      type: Number,
      default: null,
      min: 0,
      max: 48
    },
    dedicacion: {
      type: String,
      enum: ["tiempo_completo", "medio_tiempo", "por_horas"],
      default: null
    },
    jornadaSemanalPractica: {
      type: Number,
      default: null,
      min: 0
    },
    fechaInicioPractica: {
      type: Date,
      default: null
    },
    fechaFinPractica: {
      type: Date,
      default: null
    },
    horario: {
      type: String,
      default: null
    },

    // Área de desempeño y enlaces
    areaDesempeno: {
      type: String,
      default: null
    },
    enlacesFormatoEspecificos: {
      type: String,
      maxlength: 500,
      default: null
    },

    // Documentos de apoyo
    documentos: [{
      nombre: {
        type: String,
        required: true
      },
      archivo: {
        originalName: String,
        fileName: String,
        path: String,
        size: Number,
        mimeType: String
      },
      requerido: {
        type: Boolean,
        default: false
      },
      orden: {
        type: Number,
        default: 1
      }
    }],

    // Salario emocional y promedio
    salarioEmocional: {
      type: [String],
      default: []
    },
    promedioMinimoRequerido: {
      type: String,
      default: null
    },

    // Formación académica requerida
    formacionAcademica: [{
      level: {
        type: String,
        enum: ["Pregrado", "Posgrado"],
        required: true
      },
      program: {
        type: String,
        required: true
      }
    }],

    // Idiomas requeridos
    idiomas: [{
      language: {
        type: String,
        required: true
      },
      level: {
        type: String,
        enum: ["A1", "A2", "B1", "B2", "C1", "C2", "Nativo"],
        required: true
      }
    }],

    // Funciones y requisitos
    funciones: {
      type: String,
      minlength: [60, "Las funciones deben tener al menos 60 caracteres"],
      default: null
    },
    requisitos: {
      type: String,
      required: true
    },

    // Estado de la oportunidad
    estado: {
      type: String,
      enum: [
        "Creada",
        "En Revisión",
        "Revisada",
        "Activa",
        "Rechazada",
        "Cerrada",
        "Vencida"
      ],
      default: "Creada"
    },

    // Fechas de cambio de estado
    fechaCreacion: {
      type: Date,
      default: Date.now
    },
    fechaRevision: {
      type: Date,
      default: null
    },
    fechaActivacion: {
      type: Date,
      default: null
    },
    fechaCierre: {
      type: Date,
      default: null
    },
    fechaVencimientoEstado: {
      type: Date,
      default: null
    },

    // Usuario que revisó/activó/rechazó
    revisadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    activadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    rechazadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    comentariosRevision: {
      type: String,
      default: null
    },
    motivoRechazo: {
      type: String,
      default: null
    },
    motivoRechazoOtro: {
      type: String,
      default: null
    },
    
    // Historial de cambios de estado
    historialEstados: [{
      estadoAnterior: {
        type: String,
        enum: [
          "Creada",
          "En Revisión",
          "Revisada",
          "Activa",
          "Rechazada",
          "Cerrada",
          "Vencida"
        ]
      },
      estadoNuevo: {
        type: String,
        enum: [
          "Creada",
          "En Revisión",
          "Revisada",
          "Activa",
          "Rechazada",
          "Cerrada",
          "Vencida"
        ],
        required: true
      },
      cambiadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      fechaCambio: {
        type: Date,
        default: Date.now
      },
      motivo: {
        type: String,
        default: null
      },
      comentarios: {
        type: String,
        default: null
      }
    }],

    // Postulaciones (relación con estudiantes)
    postulaciones: [{
      estudiante: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
      },
      fechaPostulacion: {
        type: Date,
        default: Date.now
      },
      estado: {
        type: String,
        enum: ["pendiente", "en_revision", "seleccionado", "rechazado"],
        default: "pendiente"
      },
      documentos: [{
        tipo: String,
        archivo: {
          originalName: String,
          fileName: String,
          path: String,
          size: Number,
          mimeType: String
        }
      }],
      revisadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      fechaRevision: {
        type: Date,
        default: null
      },
      comentarios: {
        type: String,
        default: null
      }
    }],

    // Usuario que creó la oportunidad
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Aprobación por programa académico
    aprobacionesPorPrograma: [{
      programa: {
        level: {
          type: String,
          enum: ["Pregrado", "Posgrado"],
          required: true
        },
        program: {
          type: String,
          required: true
        }
      },
      estado: {
        type: String,
        enum: ["pendiente", "aprobado", "rechazado"],
        default: "pendiente"
      },
      aprobadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      fechaAprobacion: {
        type: Date,
        default: null
      },
      comentarios: {
        type: String,
        default: null
      }
    }]
  },
  {
    timestamps: true
  }
);

// Índices para búsquedas eficientes
opportunitySchema.index({ company: 1, estado: 1 });
opportunitySchema.index({ tipo: 1, estado: 1 });
opportunitySchema.index({ fechaVencimiento: 1 });
opportunitySchema.index({ "postulaciones.estudiante": 1 });
opportunitySchema.index({ creadoPor: 1 });

// Middleware para inicializar aprobaciones por programa cuando se crea la oportunidad
opportunitySchema.pre("save", function(next) {
  // Si es un nuevo documento y tiene formación académica, inicializar aprobaciones
  if (this.isNew && this.formacionAcademica && this.formacionAcademica.length > 0) {
    // Solo inicializar si no existen aprobaciones
    if (!this.aprobacionesPorPrograma || this.aprobacionesPorPrograma.length === 0) {
      this.aprobacionesPorPrograma = this.formacionAcademica.map(formacion => ({
        programa: {
          level: formacion.level,
          program: formacion.program
        },
        estado: "pendiente"
      }));
    }
  }
  next();
});

// Middleware para actualizar fechas según el estado
opportunitySchema.pre("save", function(next) {
  if (this.isModified("estado")) {
    const now = new Date();
    
    switch (this.estado) {
      case "En Revisión":
        this.fechaRevision = now;
        // Inicializar aprobaciones por programa si no existen y hay formación académica
        if (this.formacionAcademica && this.formacionAcademica.length > 0) {
          if (!this.aprobacionesPorPrograma || this.aprobacionesPorPrograma.length === 0) {
            this.aprobacionesPorPrograma = this.formacionAcademica.map(formacion => ({
              programa: {
                level: formacion.level,
                program: formacion.program
              },
              estado: "pendiente"
            }));
          }
        }
        break;
      case "Activa":
        this.fechaActivacion = now;
        break;
      case "Cerrada":
        this.fechaCierre = now;
        break;
      case "Vencida":
        this.fechaVencimientoEstado = now;
        break;
    }
  }
  next();
});

export default mongoose.model("Opportunity", opportunitySchema);
