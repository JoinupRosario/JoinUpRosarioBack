import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: String, unique: true, required: true },
    faculty: { type: String, required: true },
    program: { type: String, required: true },
    semester: { type: Number, required: true },
    academicPeriod: { type: String, required: true },
    phone: { type: String },
    address: { type: String },
    birthDate: { type: Date },
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String
    },
    cv: { type: String }, // URL del CV
    profile: {
      skills: [String],
      interests: [String],
      languages: [{
        name: String,
        level: String
      }],
      experience: [{
        company: String,
        position: String,
        duration: String,
        description: String
      }]
    },
    status: {
      type: String,
      enum: ["active", "inactive", "graduated", "suspended"],
      default: "active"
    },
    internship: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Internship"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Student", studentSchema);
