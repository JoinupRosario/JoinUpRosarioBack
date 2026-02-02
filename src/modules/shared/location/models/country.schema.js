import mongoose from "mongoose";

const countrySchema = new mongoose.Schema({
  // ID original de MySQL (para referencia durante migración)
  mysqlId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  sortname: {
    type: String,
    required: true,
    maxlength: 3
  },
  isoAlpha2: {
    type: String,
    maxlength: 2,
    default: null
  },
  isoNumeric: {
    type: Number,
    default: null
  },
  name: {
    type: String,
    required: true,
    maxlength: 150
  }
}, { 
  timestamps: true 
});

// Índices
countrySchema.index({ name: 1 });
countrySchema.index({ sortname: 1 });

export default mongoose.model("Country", countrySchema);
