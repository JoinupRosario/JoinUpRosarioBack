import mongoose from "mongoose";

/**
 * Postulante (estudiante habilitado para prácticas y pasantías).
 * Estructura según tenant-1.sql tabla `postulant` (CREATE TABLE líneas ~2016-2037).
 *
 * Columnas SQL → este schema:
 *   type_of_identification (bigint→item), gender (bigint→item), dateBirth, country_birth_id,
 *   state_birth_id, city_birth_id, phone, address, country_residence_id, state_residence_id,
 *   city_residence_id, alternate_email, linkedin_link, instagram, twitter, personal_website,
 *   photo_id (→attachment), filling_percentage, filled, postulant_id (PK, FK→user.id).
 *
 * 7 FK: city_birth_id→city, city_residence_id→city, country_birth_id→country,
 * country_residence_id→country, state_birth_id→state, state_residence_id→state, postulant_id→user.
 */
const postulantsSchema = new mongoose.Schema(
  {
    /** PK en MySQL; además FK a user(id). Ref al usuario en MongoDB. */
    postulantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    /** ID en MySQL (postulant_id) para migración y referencias legacy. */
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    /** Tipo de documento (item.id en MySQL). */
    typeOfIdentification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
    },
    /** Género (item.id en MySQL). */
    gender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
    },
    dateBirth: { type: Date },
    phone: { type: String, maxlength: 20 },
    address: { type: String, maxlength: 150 },
    alternateEmail: { type: String, required: true, maxlength: 100 },
    linkedinLink: { type: String, maxlength: 100 },
    instagram: { type: String, maxlength: 250 },
    twitter: { type: String, maxlength: 100 },
    personalWebsite: { type: String, maxlength: 100 },
    /** Ref a attachment (photo) o ruta del archivo. */
    photoId: { type: mongoose.Schema.Types.Mixed },
    fillingPercentage: { type: Number, default: 0 },
    filled: { type: Boolean, default: false },
    /** Estado para la práctica (RQ03_HU001): Autorizado | No autorizado | En Revisión. No existe en MySQL; uso en app. */
    estatePostulant: { type: String, trim: true },

    /** FK_postulant_country → country(id) */
    countryBirthId: { type: mongoose.Schema.Types.ObjectId, ref: "Country" },
    /** FK_postulant_state → state(id) */
    stateBirthId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
    /** FK_postulant_city → city(id) */
    cityBirthId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
    /** FK_postulant_country_2 → country(id) */
    countryResidenceId: { type: mongoose.Schema.Types.ObjectId, ref: "Country" },
    /** FK_postulant_state_2 → state(id) */
    stateResidenceId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
    /** FK_postulant_city_2 → city(id) */
    cityResidenceId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
  },
  { timestamps: true }
);

postulantsSchema.index({ postulantId: 1 });
postulantsSchema.index({ mysqlId: 1 });
postulantsSchema.index({ countryBirthId: 1 });
postulantsSchema.index({ stateBirthId: 1 });
postulantsSchema.index({ cityBirthId: 1 });
postulantsSchema.index({ countryResidenceId: 1 });
postulantsSchema.index({ stateResidenceId: 1 });
postulantsSchema.index({ cityResidenceId: 1 });

export default mongoose.model("Postulant", postulantsSchema, "postulants");
