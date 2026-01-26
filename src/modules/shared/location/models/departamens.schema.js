import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  country: {
    type: mongoose.Types.ObjectId,
    ref: "countries",
    required: true
  }
}, { timestamps: true });

export default mongoose.model("departments", departmentSchema);
