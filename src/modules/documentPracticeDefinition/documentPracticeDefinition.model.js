/**
 * Definición de documentos para legalizar práctica académica.
 * Origen MySQL: document_practice_definition, document_practice_def_program, allowed_extensions.
 * mysqlId = document_practice_definition_id (PK MySQL).
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

const documentPracticeDefinitionSchema = new mongoose.Schema(
  {
    mysqlId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },
    documentTypeItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      required: true,
    },
    practiceTypeItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "items",
      required: true,
    },
    documentName: { type: String, required: true, maxlength: 100, trim: true },
    documentObservation: { type: String, maxlength: 500, default: "" },
    documentMandatory: { type: Boolean, default: false },
    documentOrder: { type: Number, required: true, default: 0 },
    functionalLetter: { type: Boolean, default: false },
    showFormTracing: { type: Boolean, default: false },
    bindingAgreement: { type: Boolean, default: false },
    requiresAdditionalApproval: { type: Boolean, default: false },
    programFaculties: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProgramFaculty" }],
    /** Ítems del parámetro L_EXTENSIONS (listId en Mongo). */
    extensionItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "items" }],
    /** Derivado de extensionItems / migración (ej. pdf, docx). */
    extensionCodes: [{ type: String, trim: true }],
    /** Traza migración: program_faculty_id por fila en document_practice_def_program */
    migratedProgramFacultyMysqlIds: [{ type: Number }],
    /** Traza migración: item_id por fila en allowed_extensions */
    migratedExtensionItemMysqlIds: [{ type: Number }],
    templateFile: { type: fileRefSchema, default: null },
    modelFile: { type: fileRefSchema, default: null },
  },
  { timestamps: true }
);

documentPracticeDefinitionSchema.index({ documentOrder: 1 });

export default mongoose.model(
  "DocumentPracticeDefinition",
  documentPracticeDefinitionSchema,
  "document_practice_definitions"
);
