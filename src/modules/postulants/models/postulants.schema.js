import mongoose from "mongoose";

const postulantsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Types.ObjectId,
    ref: "User",
    required: true
  },
  identity_postulant: {type:  String, required: true },
  type_doc_postulant: {type:  String },
  gender_postulant: {type:  String },
  date_nac_postulant: {type:  Date },

  
  nac_country: { type: mongoose.Types.ObjectId, ref: "countries" },
  nac_department: { type: mongoose.Types.ObjectId, ref: "departments" },
  nac_city: { type: mongoose.Types.ObjectId, ref: "cities" },

  residence_country: { type: mongoose.Types.ObjectId, ref: "countries" },
  residence_department: { type: mongoose.Types.ObjectId, ref: "departments" },
  residence_city: { type: mongoose.Types.ObjectId, ref: "cities" },

  full_profile: {type:  Boolean, default: false, required: true },
  acept_terms: {type:  Boolean, default: false, required: true },
  years_exp: {type:  String },
  time_total_exp: {type:  Number },

  wage_aspiration_min: {type:  Number },
  wage_aspiration_max: {type:  Number },

  estate_postulant: {type:  String, required: true },

  phone_number: { type: String },
  mobile_number: { type: String },
  linkedin_url: { type: String },
  instagram_url: { type: String },
  twitter_url: { type: String },
  website_url: { type: String },
  profile_picture: { type: String },
  address: { type: String },

  date_register: {type:  Date },

}, { timestamps: true });

export default mongoose.model("postulants", postulantsSchema);