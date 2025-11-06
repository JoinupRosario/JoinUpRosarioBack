import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accion: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'OTHER'],
    uppercase: true
  },
  modulo: {
    type: String,
    required: true,
    trim: true
  },
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  descripcion: {
    type: String,
    required: true,
    trim: true
  },
  datosAntes: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  datosDespues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  ip: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índices para búsquedas rápidas
logSchema.index({ usuario: 1, createdAt: -1 });
logSchema.index({ modulo: 1, accion: 1, createdAt: -1 });
logSchema.index({ entidadId: 1, modulo: 1 });
logSchema.index({ createdAt: -1 });

export default mongoose.model('Log', logSchema);

