import mongoose from "mongoose";

const sucursalSchema = new mongoose.Schema(
  {
    // Datos básicos de la sucursal
    nombre: { 
      type: String, 
      required: true,
      trim: true
    },
    codigo: { 
      type: String, 
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    direccion: { 
      type: String,
      trim: true
    },
    
    // Ubicación
    pais: { 
      type: String,
      trim: true
    },
    ciudad: { 
      type: String,
      trim: true
    },
    
    // Directorio activo
    directorioActivo: {
      tipo: {
        type: String,
        enum: ['LDAP', 'DNS', 'DHCP', 'OTRO'],
        required: true
      },
      urlBase: {
        type: String,
        required: true,
        trim: true
      },
      tipoRespuesta: {
        type: String,
        trim: true
      },
      instancia: {
        type: String,
        trim: true
      },
      ubicacionCache: {
        type: String,
        default: 'localStorage',
        trim: true
      },
      clienteId: {
        type: String,
        trim: true
      },
      urlAutenticacion: {
        type: String,
        trim: true
      },
      urlAcceso: {
        type: String,
        trim: true
      }
    },
    
    // Estado
    estado: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Índices para búsquedas
sucursalSchema.index({ codigo: 1 });
sucursalSchema.index({ nombre: 1 });
sucursalSchema.index({ estado: 1 });

const Sucursal = mongoose.model("Sucursal", sucursalSchema);

export default Sucursal;

