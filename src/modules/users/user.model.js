import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: [
        "superadmin",
        "admin",
        "student",
        "company",
        "tutor",
        "leader",
        "monitor",
      ],
      default: "student",
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
