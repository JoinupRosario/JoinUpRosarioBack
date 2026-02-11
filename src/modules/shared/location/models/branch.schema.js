import mongoose from "mongoose";

/**
 * Sede (branch). Estructura según tenant-1.sql tabla `branch`.
 * mysqlId = branch_id en MySQL, para migraciones y FKs (ej. faculty.branch_id).
 * activeDirectory: ref a items (item.id en MySQL).
 */
const branchSchema = new mongoose.Schema(
  {
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },
    branchId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    code: {
      type: String,
      trim: true,
      maxlength: 25,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    country: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      default: null,
    },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      default: null,
    },
    mysqlCountryId: {
      type: Number,
      default: null,
      index: true,
    },
    mysqlCityId: {
      type: Number,
      default: null,
      index: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 250,
      default: null,
    },
    /** Ref al ítem directorio activo (item.id en MySQL). */
    activeDirectory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      default: null,
    },
    parameterDirectory: {
      type: String,
      maxlength: 500,
      default: null,
    },
    dateCreation: {
      type: Date,
      default: null,
    },
    userCreator: {
      type: String,
      maxlength: 100,
      default: null,
    },
    dateUpdate: {
      type: Date,
      default: null,
    },
    userUpdater: {
      type: String,
      maxlength: 100,
      default: null,
    },
    status: {
      type: String,
      required: true,
      maxlength: 10,
    },
  },
  { timestamps: true }
);

branchSchema.index({ name: 1 });
branchSchema.index({ status: 1 });
branchSchema.index({ code: 1 });
branchSchema.index({ mysqlId: 1 });

export default mongoose.model("Branch", branchSchema, "branches");
