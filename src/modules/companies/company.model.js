import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nit: { type: String, unique: true, required: true },
    sector: { type: String, required: true },
    size: {
      type: String,
      enum: ["micro", "pequeña", "mediana", "grande"],
      required: true
    },
    address: { type: String, required: true },
    city: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    website: { type: String },
    description: { type: String },
    logo: { type: String }, // URL del logo
    contact: {
      name: { type: String, required: true },
      position: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true }
    },
    status: {
      type: String,
      enum: ["active", "inactive", "pending_approval"],
      default: "pending_approval"
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    approvedAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("Company", companySchema);
