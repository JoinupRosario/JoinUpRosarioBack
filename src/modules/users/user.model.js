import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  /** ID en MySQL (user.id) para migración y mapeo postulant_id → User. */
  mysqlId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder los 100 caracteres']
  },
  email: {
    type: String,
    required: [true, 'El email es obligatorio'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email inválido']
  },
  code:{
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
  },
  estado: {
    type: Boolean,
    default: true
  },
  modulo: {
    type: String,
    enum: ['administrativo', 'estudiante', 'entidades'],
    trim: true
  },
  debeCambiarPassword: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índices
userSchema.index({ email: 1 });
userSchema.index({ estado: 1 });
userSchema.index({ modulo: 1 });

export default mongoose.model('User', userSchema);