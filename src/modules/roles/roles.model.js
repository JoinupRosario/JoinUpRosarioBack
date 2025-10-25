import mongoose from 'mongoose';

const rolSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del rol es obligatorio'],
    unique: true,
    trim: true,
    maxlength: [100, 'El nombre no puede exceder los 100 caracteres']
  },
  permisos: [{
    permiso: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permiso',
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
  },
  esDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índices para mejor performance
rolSchema.index({ nombre: 1 });
rolSchema.index({ estado: 1 });
rolSchema.index({ 'permisos.permiso': 1 });

// Método estático para buscar roles activos
rolSchema.statics.findActive = function() {
  return this.find({ estado: true }).populate('permisos.permiso');
};

// Método estático para buscar por ID con populate
rolSchema.statics.findByIdWithPermissions = function(id) {
  return this.findById(id).populate('permisos.permiso');
};

// Método de instancia para activar/desactivar rol
rolSchema.methods.cambiarEstado = function() {
  this.estado = !this.estado;
  return this.save();
};

// Método para agregar permiso al rol
rolSchema.methods.agregarPermiso = function(permisoId, estado = true) {
  const permisoExistente = this.permisos.find(p => 
    p.permiso && p.permiso.toString() === permisoId.toString()
  );
  
  if (!permisoExistente) {
    this.permisos.push({
      permiso: permisoId,
      estado: estado
    });
  }
  return this.save();
};

// Método para remover permiso del rol
rolSchema.methods.removerPermiso = function(permisoId) {
  this.permisos = this.permisos.filter(p => 
    p.permiso && p.permiso.toString() !== permisoId.toString()
  );
  return this.save();
};

// Método para cambiar estado de un permiso específico
rolSchema.methods.cambiarEstadoPermiso = function(permisoId, estado) {
  const permiso = this.permisos.find(p => 
    p.permiso && p.permiso.toString() === permisoId.toString()
  );
  
  if (permiso) {
    permiso.estado = estado;
  }
  return this.save();
};

// Middleware para validar antes de guardar
rolSchema.pre('save', function(next) {
  if (this.nombre) {
    this.nombre = this.nombre.trim();
  }
  if (this.descripcion) {
    this.descripcion = this.descripcion.trim();
  }
  next();
});

export default mongoose.model('Rol', rolSchema);