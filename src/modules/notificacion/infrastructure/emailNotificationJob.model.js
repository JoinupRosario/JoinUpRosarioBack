import mongoose from "mongoose";

/**
 * Cola persistente de envíos de correo (MongoDB). Evita bloquear la petición HTTP y permite reintentos.
 * Colección: email_notification_jobs
 */
const emailNotificationJobSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true, maxlength: 998 },
    html: { type: String, default: "" },
    text: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null, maxlength: 2000 },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    processingStartedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emailNotificationJobSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model(
  "EmailNotificationJob",
  emailNotificationJobSchema,
  "email_notification_jobs"
);
