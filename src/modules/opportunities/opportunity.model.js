import mongoose from "mongoose";

const opportunitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Company", 
      required: true 
    },
    requirements: {
      minSemester: { type: Number, required: true },
      maxSemester: { type: Number },
      programs: [String], // Programas académicos elegibles
      skills: [String],
      languages: [{
        name: String,
        level: String
      }]
    },
    details: {
      duration: { type: Number, required: true }, // En semanas
      hoursPerWeek: { type: Number, required: true },
      modality: {
        type: String,
        enum: ["presencial", "remoto", "híbrido"],
        required: true
      },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      salary: { type: Number }, // Opcional
      benefits: [String]
    },
    supervisor: {
      name: { type: String, required: true },
      position: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String }
    },
    status: {
      type: String,
      enum: ["draft", "published", "closed", "cancelled"],
      default: "draft"
    },
    publishedAt: { type: Date },
    closedAt: { type: Date },
    applications: [{
      student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
      appliedAt: { type: Date, default: Date.now },
      status: {
        type: String,
        enum: ["pending", "reviewed", "accepted", "rejected"],
        default: "pending"
      },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: { type: Date },
      comments: String
    }],
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    }
  },
  { timestamps: true }
);

export default mongoose.model("Opportunity", opportunitySchema);
