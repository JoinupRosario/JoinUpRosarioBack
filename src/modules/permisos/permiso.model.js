import mongoose from 'mongoose';

const permisoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del permiso es obligatorio'],
    unique: true,
    trim: true
  },
  codigo: {
    type: String,
    required: [true, 'El código del permiso es obligatorio'],
    unique: true,
    trim: true,
    uppercase: true
  },
  modulo: {
    type: String,
    required: [true, 'El módulo del permiso es obligatorio'],
    enum: [
      'EMPRESA',
      'POSTULANTES', 
      'OPORTUNIDADES',
      'PRACTICAS',
      'MONITORIAS',
      'REPORTES',
      'SUCURSALES',
      'ROLES',
      'USUARIOS',
      'CONFIGURACION',
      'PERIODOS',
      'ESTADOS_PRACTICA',
      'ADJUNTOS',
      'FORMULARIOS',
      'LISTAS_SISTEMA'
    ]
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índices para mejor performance
permisoSchema.index({ codigo: 1 });
permisoSchema.index({ modulo: 1 });

// Método estático para buscar permisos por módulo
permisoSchema.statics.findByModulo = function(modulo) {
  return this.find({ modulo });
};

export default mongoose.model('Permiso', permisoSchema);