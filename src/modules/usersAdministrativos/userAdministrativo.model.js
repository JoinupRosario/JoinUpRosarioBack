import mongoose from 'mongoose';

const userAdministrativoSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  nombres: {
    type: String,
    required: [true, 'Los nombres son obligatorios'],
    trim: true
  },
  apellidos: {
    type: String,
    required: [true, 'Los apellidos son obligatorios'],
    trim: true
  },
  cargo: {
    type: String,
    trim: true
  },
  identificacion: {
    type: String,
    required: [true, 'La identificación es obligatoria'],
    unique: true,
    trim: true
  },
  telefono: {
    type: String,
    trim: true
  },
  extension: {
    type: String,
    trim: true
  },
  movil: {
    type: String,
    trim: true
  },
  roles: [{
    rol: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rol',
      required: true
    },
    estado: {
      type: Boolean,
      default: true
    }
  }],
  estado: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índices
userAdministrativoSchema.index({ identificacion: 1 });
userAdministrativoSchema.index({ user: 1 });
userAdministrativoSchema.index({ estado: 1 });
userAdministrativoSchema.index({ 'roles.rol': 1 });

// Método para agregar rol
userAdministrativoSchema.methods.agregarRol = function(rolId, estado = true) {
  const rolExistente = this.roles.find(r => 
    r.rol && r.rol.toString() === rolId.toString()
  );
  
  if (!rolExistente) {
    this.roles.push({
      rol: rolId,
      estado: estado
    });
  }
  return this.save();
};

// Método para remover rol
userAdministrativoSchema.methods.removerRol = function(rolId) {
  this.roles = this.roles.filter(r => 
    r.rol && r.rol.toString() !== rolId.toString()
  );
  return this.save();
};

// Método para cambiar estado de rol
userAdministrativoSchema.methods.cambiarEstadoRol = function(rolId, estado) {
  const rol = this.roles.find(r => 
    r.rol && r.rol.toString() === rolId.toString()
  );
  
  if (rol) {
    rol.estado = estado;
  }
  return this.save();
};

export default mongoose.model('UserAdministrativo', userAdministrativoSchema);