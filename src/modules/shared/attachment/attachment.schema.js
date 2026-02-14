/**
 * Adjunto (archivo). Estructura según tenant-1.sql tabla `attachment` (líneas ~433-444).
 * id, name, content_type, filepath, status, downloaded, date_creation, user_creator, date_update, user_updater.
 */
import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    mysqlId: { type: Number, unique: true, sparse: true },
    name: { type: String, required: true, default: "" },
    contentType: { type: String, required: true },
    filepath: { type: String, required: true, default: "" },
    status: { type: String, required: true },
    downloaded: { type: Boolean },
    dateCreation: { type: Date },
    userCreator: { type: String },
    dateUpdate: { type: Date },
    userUpdater: { type: String },
  },
  { timestamps: true }
);

attachmentSchema.index({ mysqlId: 1 });

export default mongoose.model("Attachment", attachmentSchema, "attachments");
