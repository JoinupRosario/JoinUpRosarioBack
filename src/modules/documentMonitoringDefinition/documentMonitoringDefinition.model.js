/**
 * Definición de documentos para legalizar monitoría.
 * Origen MySQL: document_monitoring_definition, monitoring_allowed_extensions.
 * Campos alineados al formulario funcional (sin tipo de práctica ni programas).
 */
import mongoose from "mongoose";

const fileRefSchema = new mongoose.Schema(
  {
    storedPath: { type: String, default: "" },
    originalName: { type: String, default: "" },
    attachmentMysqlId: { type: Number, default: null },
    attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Attachment", default: null },
  },
  { _id: false }
);

const documentMonitoringDefinitionSchema = new mongoose.Schema(
  {
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    legacyMysqlStatus: { type: String, maxlength: 40, default: "" },
    documentTypeItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      required: true,
    },
    documentName: { type: String, required: true, maxlength: 100, trim: true },
    documentObservation: { type: String, maxlength: 500, default: "" },
    documentMandatory: { type: Boolean, default: false },
    documentOrder: { type: Number, required: true, default: 0 },
    showFormTracing: { type: Boolean, default: false },
    extensionItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "items" }],
    extensionCodes: [{ type: String, trim: true }],
    migratedExtensionItemMysqlIds: [{ type: Number }],
    templateFile: { type: fileRefSchema, default: null },
    modelFile: { type: fileRefSchema, default: null },
  },
  { timestamps: true }
);

documentMonitoringDefinitionSchema.index({ documentOrder: 1 });

export default mongoose.model(
  "DocumentMonitoringDefinition",
  documentMonitoringDefinitionSchema,
  "document_monitoring_definitions"
);
