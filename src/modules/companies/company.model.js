import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    // Identificación y nombres
    name: { type: String, required: true }, // Razón Social (compatibilidad hacia atrás)
    legalName: { type: String }, // Alias explícito de razón social
    commercialName: { type: String },
    idType: {
      type: String,
      enum: [
        "NIT",
        "CC",
        "CE",
        "PASAPORTE",
        "OTRO"
      ],
      default: "NIT"
    },
    idNumber: { type: String },
    nit: { type: String, unique: true, sparse: true }, // puede coincidir con idNumber

    // Clasificaciones
    sector: { type: String }, // Sector general mostrado en la lista
    sectorMineSnies: { type: String },
    economicSector: { type: String },
    ciiuCode: { type: String },
    size: {
      type: String,
      enum: ["micro", "pequeña", "mediana", "grande"],
      default: "mediana"
    },
    arl: { type: String },

    // Contacto y ubicación
    address: { type: String },
    city: { type: String },
    country: { type: String, default: "Colombia" },
    countryCode: { type: String },
    state: { type: String },
    stateCode: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String },
    domain: { type: String },
    linkedinUrl: { type: String },

    // Contenidos
    description: { type: String }, // breve descripción
    missionVision: { type: String },

    // Logo y permisos
    logo: { type: String },
    authorizeLogoUsage: { type: Boolean, default: false },

    // Reglas y capacidad
    canCreateOpportunities: { type: Boolean, default: false },
    operatesAsAgency: { type: Boolean, default: false },
    wantsPracticeAgreement: { type: Boolean, default: false },
    programsOfInterest: [{
      level: { type: String },
      program: { type: String }
    }],

    // Documentos básicos (paths o ids de Document)
    chamberOfCommerceCertificate: { type: String },
    rutDocument: { type: String },
    agencyAccreditationDocument: { type: String },

    // Contacto principal
    contact: {
      name: { type: String },
      position: { type: String },
      phone: { type: String },
      email: { type: String }
    },
    legalRepresentative: {
      firstName: { type: String },
      lastName: { type: String },
      email: { type: String },
      idType: {
        type: String,
        enum: ["CC", "CE", "PASAPORTE", "NIT", "OTRO"],
        default: "CC"
      },
      idNumber: { type: String }
    },

    branches: [
      {
        name: { type: String },
        address: { type: String },
        phone: { type: String },
        country: { type: String },
        countryCode: { type: String },
        state: { type: String },
        stateCode: { type: String },
        city: { type: String },
        domain: { type: String }
      }
    ],

    // Contactos de la empresa (array de contactos adicionales)
    contacts: [{
      // Referencia al usuario creado en el sistema
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      // Datos personales
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      alternateEmail: { type: String },
      // Ubicación
      country: { type: String },
      city: { type: String },
      address: { type: String },
      // Contacto
      phone: { type: String },
      extension: { type: String },
      mobile: { type: String },
      // Identificación
      idType: {
        type: String,
        enum: ["CC", "CE", "PASAPORTE", "NIT", "OTRO"],
        default: "CC"
      },
      identification: { type: String },
      // Usuario en el sistema
      userEmail: { type: String, required: true }, // Email del usuario en User
      // Datos de entidad
      dependency: { type: String }, // Dependencia dentro de la empresa
      isPrincipal: { type: Boolean, default: false }, // ¿Es usuario principal?
      position: { type: String }, // Cargo dentro de la empresa
      isPracticeTutor: { type: Boolean, default: false }, // Es tutor de práctica académica
      // Estado
      status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
      }
    }],

    // Flujo de aprobación/estado
    status: {
      type: String,
      enum: ["active", "inactive", "pending_approval"],
      default: "pending_approval"
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    approvedAt: { type: Date },
    
    // ID original de MySQL (para referencia durante migración)
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true
    }
  },
  { timestamps: true }
);

// Índices útiles para búsqueda
companySchema.index({ name: 1 });
companySchema.index({ commercialName: 1 });
companySchema.index({ nit: 1 }, { unique: true, sparse: true });
companySchema.index({ sector: 1, city: 1 });

export default mongoose.model("Company", companySchema);
