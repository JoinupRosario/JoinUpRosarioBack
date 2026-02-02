import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  // ID original de MySQL (para referencia durante migración)
  mysqlId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  value: {
    type: String,
    required: true,
    maxlength: 100
  },
  valueForReports: {
    type: String,
    maxlength: 50,
    default: null
  },
  valueForCalculations: {
    type: String,
    maxlength: 5,
    default: null
  },
  description: {
    type: String,
    maxlength: 300,
    default: null
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'items',
    default: null
  },
  // También guardamos el parent_id original de MySQL para la migración
  mysqlParentId: {
    type: Number,
    default: null,
    index: true
  },
  status: {
    type: String,
    required: true,
    maxlength: 100
  },
  listId: {
    type: String,
    required: true,
    maxlength: 100,
    index: true
  },
  sort: {
    type: Number,
    default: null
  },
  filters: {
    type: String,
    maxlength: 100,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Índices para mejorar búsquedas
itemSchema.index({ listId: 1, sort: 1 });
itemSchema.index({ parentId: 1 });
itemSchema.index({ status: 1 });

export default mongoose.model("items", itemSchema);
