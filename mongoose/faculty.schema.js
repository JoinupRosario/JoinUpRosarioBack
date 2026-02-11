import mongoose from "mongoose";

const facultySchema = new mongoose.Schema({
  faculty_id: { type: Number, unique: true, sparse: true }, // PK legacy en MySQL
  code: { type: String },
  name: { type: String },
  authorized_signer: { type: String },
  identification_type_signer: { type: Number },
  identification_signer: { type: String },
  identification_from_signer: { type: Number },
  position_signer: { type: String },
  mail_signer: { type: String },
  branch_id: { type: Number },
  date_creation: { type: Date },
  user_creater: { type: String },
  date_update: { type: Date },
  user_update: { type: String },
  status: { type: String },

}, { timestamps: true });

export default mongoose.model("faculty", facultySchema);