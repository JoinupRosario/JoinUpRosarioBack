import mongoose from "mongoose";

const stateSchema = new mongoose.Schema({
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
    maxlength: 30
  },
  dianCode: {
    type: String,
    maxlength: 3,
    default: null
  },
  country: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Country",
    required: true,
    index: true
  },
  // ID de MySQL del país para referencia durante migración
  mysqlCountryId: {
    type: Number,
    index: true
  }
}, { 
  timestamps: true 
});

// Índices
stateSchema.index({ name: 1 });
stateSchema.index({ country: 1 });
stateSchema.index({ dianCode: 1 });

export default mongoose.model("State", stateSchema);
