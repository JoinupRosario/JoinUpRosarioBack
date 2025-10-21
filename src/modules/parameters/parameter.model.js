import mongoose from "mongoose";

const parameterSchema = new mongoose.Schema(
  {
    category: { 
      type: String, 
      required: true,
      enum: [
        "academic_periods",
        "faculties", 
        "programs",
        "document_types",
        "sectors",
        "company_sizes",
        "internship_types",
        "evaluation_criteria"
      ]
    },
    name: { type: String, required: true },
    code: { type: String, unique: true, required: true },
    description: { type: String },
    value: { type: mongoose.Schema.Types.Mixed }, // Para valores complejos
    metadata: {
      active: { type: Boolean, default: true },
      order: { type: Number, default: 0 },
      parent: { type: mongoose.Schema.Types.ObjectId, ref: "Parameter" },
      tags: [String]
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

// Índices para búsquedas eficientes
parameterSchema.index({ category: 1, "metadata.active": 1 });
parameterSchema.index({ code: 1 });

export default mongoose.model("Parameter", parameterSchema);
