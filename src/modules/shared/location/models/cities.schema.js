import mongoose from "mongoose";

const citySchema = new mongoose.Schema({
  name: { type: String, required: true },
  department: {
    type: mongoose.Types.ObjectId,
    ref: "departments",
    required: true
  }
}, { timestamps: true });

export default mongoose.model("cities", citySchema);
