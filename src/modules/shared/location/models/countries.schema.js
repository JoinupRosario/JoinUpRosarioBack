import mongoose from "mongoose";

const countrySchema = new mongoose.Schema({
  name: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model("countries", countrySchema);
