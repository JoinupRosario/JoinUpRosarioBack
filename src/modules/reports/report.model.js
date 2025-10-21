import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "students_by_faculty",
        "internships_by_company", 
        "opportunities_by_sector",
        "evaluation_summary",
        "attendance_report",
        "completion_rates",
        "custom"
      ],
      required: true
    },
    description: { type: String },
    filters: {
      dateRange: {
        start: Date,
        end: Date
      },
      faculties: [String],
      programs: [String],
      companies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Company" }],
      status: [String],
      academicPeriod: String
    },
    data: { type: mongoose.Schema.Types.Mixed }, // Datos del reporte
    format: {
      type: String,
      enum: ["json", "csv", "pdf", "excel"],
      default: "json"
    },
    status: {
      type: String,
      enum: ["generating", "completed", "failed"],
      default: "generating"
    },
    file: {
      name: String,
      path: String,
      size: Number,
      generatedAt: Date
    },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    parameters: { type: mongoose.Schema.Types.Mixed } // Parámetros específicos del reporte
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
