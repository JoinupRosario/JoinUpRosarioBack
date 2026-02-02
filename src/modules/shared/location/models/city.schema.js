import mongoose from "mongoose";

const citySchema = new mongoose.Schema({
  // ID original de MySQL (para referencia durante migración)
  mysqlId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 255
  },
  codDian: {
    type: String,
    maxlength: 30,
    default: null
  },
  state: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "State",
    required: true,
    index: true
  },
  // ID de MySQL del estado para referencia durante migración
  mysqlStateId: {
    type: Number,
    index: true
  }
}, { 
  timestamps: true 
});

// Índices
citySchema.index({ name: 1 });
citySchema.index({ state: 1 });
citySchema.index({ codDian: 1 });

export default mongoose.model("City", citySchema);
