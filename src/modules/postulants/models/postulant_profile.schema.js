import mongoose from "mongoose";

/**
 * Perfil extendido del postulante (hoja de vida). tenant-1.sql `postulant_profile` (líneas ~2045-2078).
 * Columnas: id, postulant_id, student_code, academic_user, academic_id, degree_option, emphasis,
 * years_experience, filled, last_time_experience, total_time_experience, accept_terms, cv_video_link,
 * profile_text, skills_technical_software, condition_discapacity, level_job, other_studies, possibility_fly,
 * salary_range_min/max, retired, employee, independent, have_business, company_name, company_sector,
 * web_site_company, date_creation, user_creator, date_update, user_updater.
 * FK: postulant_id→postulant, level_job→item, company_sector→item.
 */
const postulantProfileSchema = new mongoose.Schema(
  {
    /** postulant_fk → postulant(postulant_id) */
    postulantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Postulant",
      required: true,
      index: true,
    },
    /** ID en MySQL para migración. */
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
    },

    studentCode: { type: String, required: true, maxlength: 45 },
    academicUser: { type: String, maxlength: 100 },
    academicId: { type: Number },
    degreeOption: { type: String, maxlength: 100 },
    emphasis: { type: String, maxlength: 100 },

    yearsExperience: { type: Number },
    filled: { type: Boolean, default: false },
    lastTimeExperience: { type: Number, default: 0 },
    totalTimeExperience: { type: Number, default: 0 },
    acceptTerms: { type: Boolean, default: false },

    cvVideoLink: { type: String, maxlength: 250 },
    profileText: { type: String },
    skillsTechnicalSoftware: { type: String, maxlength: 512 },
    conditionDiscapacity: { type: Boolean, default: false },

    /** FK_postulant_profile_item → item(id) */
    levelJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
    },

    otherStudies: { type: String, maxlength: 512 },
    possibilityFly: { type: Boolean, default: false },
    salaryRangeMin: { type: Number },
    salaryRangeMax: { type: Number },
    retired: { type: Boolean, default: false },
    employee: { type: Boolean, default: false },
    independent: { type: Boolean, default: false },
    haveBusiness: { type: Boolean, default: false },

    companyName: { type: String, maxlength: 256 },
    /** FK_postulant_profile_item_4 → item(id) */
    companySector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
    },
    webSiteCompany: { type: String, maxlength: 256 },

    dateCreation: { type: Date, required: true, default: Date.now },
    userCreator: { type: String, required: true, maxlength: 100 },
    dateUpdate: { type: Date },
    userUpdater: { type: String, maxlength: 100 },
  },
  { timestamps: true }
);

postulantProfileSchema.index({ postulantId: 1 });
postulantProfileSchema.index({ levelJob: 1 });
postulantProfileSchema.index({ companySector: 1 });
postulantProfileSchema.index({ mysqlId: 1 });

export default mongoose.model(
  "PostulantProfile",
  postulantProfileSchema,
  "postulant_profiles"
);
