import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { 
      type: String, 
      required: true,
      enum: [
        "cv",
        "certificate",
        "agreement",
        "acceptance_letter",
        "practice_plan",
        "monthly_report",
        "evaluation",
        "attendance_record",
        "justification",
        "other"
      ]
    },
    category: {
      type: String,
      enum: ["student", "company", "internship", "academic"],
      required: true
    },
    file: {
      originalName: { type: String, required: true },
      fileName: { type: String, required: true },
      path: { type: String, required: true },
      size: { type: Number, required: true },
      mimeType: { type: String, required: true }
    },
    relatedTo: {
      student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
      company: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
      internship: { type: mongoose.Schema.Types.ObjectId, ref: "Internship" },
      opportunity: { type: mongoose.Schema.Types.ObjectId, ref: "Opportunity" }
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "archived"],
      default: "pending"
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    comments: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: Number, default: 1 },
    isLatest: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Índices para búsquedas eficientes
documentSchema.index({ type: 1, category: 1 });
documentSchema.index({ "relatedTo.student": 1 });
documentSchema.index({ "relatedTo.company": 1 });
documentSchema.index({ "relatedTo.internship": 1 });

export default mongoose.model("Document", documentSchema);
