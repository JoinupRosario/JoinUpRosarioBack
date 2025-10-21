import mongoose from "mongoose";

const internshipSchema = new mongoose.Schema(
  {
    student: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Student", 
      required: true 
    },
    opportunity: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Opportunity", 
      required: true 
    },
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Company", 
      required: true 
    },
    academicPeriod: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    hoursPerWeek: { type: Number, required: true },
    totalHours: { type: Number, required: true },
    modality: {
      type: String,
      enum: ["presencial", "remoto", "híbrido"],
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "approved", "active", "completed", "cancelled", "failed"],
      default: "pending"
    },
    supervisors: {
      academic: {
        tutor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        leader: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        monitor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
      },
      company: {
        name: { type: String, required: true },
        position: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String }
      }
    },
    documents: {
      agreement: { type: String }, // URL del convenio
      acceptance: { type: String }, // URL de la carta de aceptación
      plan: { type: String }, // URL del plan de práctica
      reports: [{
        month: { type: Number, required: true },
        year: { type: Number, required: true },
        file: { type: String, required: true },
        submittedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending"
        },
        comments: String
      }],
      evaluations: [{
        type: {
          type: String,
          enum: ["midterm", "final", "company", "academic"],
          required: true
        },
        score: { type: Number, min: 0, max: 5 },
        comments: String,
        evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        evaluatedAt: { type: Date, default: Date.now }
      }],
      certificate: { type: String } // URL del certificado final
    },
    attendance: [{
      date: { type: Date, required: true },
      hours: { type: Number, required: true },
      description: String,
      approved: { type: Boolean, default: false }
    }],
    absences: [{
      date: { type: Date, required: true },
      reason: { type: String, required: true },
      justified: { type: Boolean, default: false },
      document: { type: String } // URL del justificativo
    }],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("Internship", internshipSchema);
