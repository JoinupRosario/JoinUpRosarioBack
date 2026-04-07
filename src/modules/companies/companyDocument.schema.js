/**
 * Documento asociado a empresa (tabla puente). Equivale a tenant-1.sql `company_document`.
 * company_id → company(id), attachment_id → attachment(id),
 * document_type / aggrement_type → item(id) (en SQL el campo se escribe "aggrement_*").
 */
import mongoose from "mongoose";
import "../shared/attachment/attachment.schema.js";
import "./company.model.js";

const companyDocumentSchema = new mongoose.Schema(
  {
    mysqlId: { type: Number, unique: true, sparse: true, index: true },
    name: { type: String, required: true, maxlength: 250, trim: true },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    attachmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attachment",
      required: true,
      index: true,
    },
    documentType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      required: true,
    },
    /** Tipo de convenio; origen MySQL: aggrement_type */
    agreementType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      required: true,
    },
    /** Origen MySQL: aggrement_code */
    agreementCode: { type: String, maxlength: 50, default: null },
    agreementStartDate: { type: Date, default: null },
    agreementEndDate: { type: Date, default: null },
    dateCreation: { type: Date, required: true },
    userCreator: { type: String, required: true, maxlength: 100 },
    dateUpdate: { type: Date, default: null },
    userUpdater: { type: String, maxlength: 100, default: null },
  },
  { timestamps: false }
);

companyDocumentSchema.index({ companyId: 1 });
companyDocumentSchema.index({ companyId: 1, mysqlId: 1 });

export default mongoose.model("CompanyDocument", companyDocumentSchema, "company_documents");
