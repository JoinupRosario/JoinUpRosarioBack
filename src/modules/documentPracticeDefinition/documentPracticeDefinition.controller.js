import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import DocumentPracticeDefinition from "./documentPracticeDefinition.model.js";
import Item from "../shared/reference-data/models/item.schema.js";
import Attachment from "../shared/attachment/attachment.schema.js";
import { s3Config, uploadToS3, deleteFromS3, getSignedDownloadUrl } from "../../config/s3.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_SUBDIR = "document-practice-definitions";
const S3_PREFIX = (process.env.DOC_PRACT_DEF_S3_PREFIX || "legalizacion-practica-def").replace(/\/$/, "");

function absUploadPath(storedPath) {
  if (!storedPath || typeof storedPath !== "string") return null;
  const clean = storedPath.replace(/^\//, "");
  return path.join(process.cwd(), "src", "uploads", clean);
}

function safeUnlink(storedPath) {
  const full = absUploadPath(storedPath);
  if (full && fs.existsSync(full)) {
    try {
      fs.unlinkSync(full);
    } catch (_) {
      /* ignore */
    }
  }
}

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === "") return def;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
}

function parseExtensionCodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).replace(/^\./, "").trim().toLowerCase()).filter(Boolean);
  }
  return String(raw)
    .split(/[,;\s]+/)
    .map((x) => x.replace(/^\./, "").trim().toLowerCase())
    .filter(Boolean);
}

function parseIds(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

const EXTENSIONS_LIST_ID = process.env.DOC_PRACT_DEF_EXTENSIONS_LIST_ID || "L_EXTENSIONS";

function valueToExtensionCode(v) {
  const s = String(v ?? "")
    .replace(/^\./, "")
    .trim()
    .toLowerCase();
  return s || "file";
}

async function resolveExtensionItems(extItemIds) {
  if (!extItemIds?.length) return null;
  const ids = [...new Set(extItemIds.map((id) => String(id)))];
  const items = await Item.find({
    _id: { $in: ids },
    listId: EXTENSIONS_LIST_ID,
  }).lean();
  if (items.length !== ids.length) {
    return {
      error: "Todas las extensiones deben ser ítems del listado L_EXTENSIONS.",
    };
  }
  const extensionCodes = items.map((i) => valueToExtensionCode(i.value));
  return { extensionItems: ids, extensionCodes };
}

const populateList = [
  { path: "documentTypeItem", select: "value description listId mysqlId" },
  { path: "practiceTypeItem", select: "value description listId mysqlId" },
  { path: "extensionItems", select: "value description listId mysqlId" },
  {
    path: "programFaculties",
    select: "code mysqlId programId facultyId",
    populate: [
      { path: "programId", select: "name code" },
      { path: "facultyId", select: "name code" },
    ],
  },
];

export async function getMeta(req, res) {
  try {
    res.json({
      success: true,
      practiceTypeListId: process.env.DOC_PRACT_DEF_PRACTICE_LIST_ID || "L_PRACTICE_TYPE",
      documentTypeListId: process.env.DOC_PRACT_DEF_DOCUMENT_TYPE_LIST_ID || "L_DOCUMENT_TYPE",
      extensionsListId: EXTENSIONS_LIST_ID,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Adjunto en S3 guardado pero definición sin templateFile/modelFile (fallo previo al guardar). */
async function enrichOrphanS3FileRefs(doc) {
  if (!doc?._id || !s3Config.isConfigured) return;
  const docId = String(doc._id);
  const base = `${escapeRegex(S3_PREFIX)}/${escapeRegex(docId)}`;

  const missingTpl =
    !doc.templateFile?.attachmentId &&
    !(doc.templateFile?.storedPath && String(doc.templateFile.storedPath).trim());
  if (missingTpl) {
    const att = await Attachment.findOne({
      filepath: { $regex: new RegExp(`^${base}/plantilla-`) },
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (att?._id) {
      doc.templateFile = {
        storedPath: "",
        originalName: att.name || "Plantilla",
        attachmentMysqlId: null,
        attachmentId: att._id,
      };
      await DocumentPracticeDefinition.updateOne(
        { _id: doc._id },
        { $set: { templateFile: doc.templateFile } }
      ).catch(() => {});
    }
  }

  const missingMod =
    !doc.modelFile?.attachmentId &&
    !(doc.modelFile?.storedPath && String(doc.modelFile.storedPath).trim());
  if (missingMod) {
    const att = await Attachment.findOne({
      filepath: { $regex: new RegExp(`^${base}/modelo-`) },
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (att?._id) {
      doc.modelFile = {
        storedPath: "",
        originalName: att.name || "Modelo",
        attachmentMysqlId: null,
        attachmentId: att._id,
      };
      await DocumentPracticeDefinition.updateOne({ _id: doc._id }, { $set: { modelFile: doc.modelFile } }).catch(
        () => {}
      );
    }
  }
}

/** Completa attachmentId y nombre desde Attachment por mysqlId (migración / datos sueltos). */
async function enrichPracticeDefFiles(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const fix = async (ref) => {
    if (!ref || typeof ref !== "object") return ref;
    const mid = ref.attachmentMysqlId;
    const needsLink = ref.attachmentId == null || ref.attachmentId === "";
    if (needsLink && mid != null && mid !== "") {
      const att = await Attachment.findOne({ mysqlId: Number(mid) }).lean();
      if (att?._id) {
        ref.attachmentId = att._id;
        if (!String(ref.originalName || "").trim()) ref.originalName = att.name || "";
      }
    }
    return ref;
  };
  if (doc.templateFile) await fix(doc.templateFile);
  if (doc.modelFile) await fix(doc.modelFile);
  await enrichOrphanS3FileRefs(doc);
  return doc;
}

export async function listDocumentPracticeDefinitions(req, res) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limitRaw = parseInt(String(req.query.limit || "15"), 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 15));
    const search = String(req.query.search || req.query.q || "").trim();

    const practiceListId = process.env.DOC_PRACT_DEF_PRACTICE_LIST_ID || "L_PRACTICE_TYPE";
    const documentTypeListId = process.env.DOC_PRACT_DEF_DOCUMENT_TYPE_LIST_ID || "L_DOCUMENT_TYPE";

    let filter = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      const items = await Item.find({
        listId: { $in: [documentTypeListId, practiceListId] },
        $or: [{ value: rx }, { description: rx }],
      })
        .select("_id listId")
        .lean();
      const docTypeMatched = items.filter((i) => String(i.listId) === documentTypeListId).map((i) => i._id);
      const practiceMatched = items.filter((i) => String(i.listId) === practiceListId).map((i) => i._id);
      const or = [{ documentName: rx }];
      if (docTypeMatched.length) or.push({ documentTypeItem: { $in: docTypeMatched } });
      if (practiceMatched.length) or.push({ practiceTypeItem: { $in: practiceMatched } });
      filter = { $or: or };
    }

    const total = await DocumentPracticeDefinition.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);

    const docs = await DocumentPracticeDefinition.find(filter)
      .populate(populateList)
      .sort({ documentOrder: 1, documentName: 1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();
    await Promise.all(docs.map((d) => enrichPracticeDefFiles(d)));
    res.json({
      success: true,
      data: docs,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function getDocumentPracticeDefinitionById(req, res) {
  try {
    const doc = await DocumentPracticeDefinition.findById(req.params.id).populate(populateList).lean();
    if (!doc) return res.status(404).json({ success: false, message: "No encontrado" });
    await enrichPracticeDefFiles(doc);
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

function isLikelyLocalFilesystemPath(fp) {
  if (!fp || typeof fp !== "string") return false;
  if (/^[A-Za-z]:[\\/]/.test(fp)) return true;
  if (fp.startsWith("/") && !fp.startsWith("//")) return true;
  if (fs.existsSync(fp)) return true;
  const joined = path.join(process.cwd(), "src", "uploads", fp);
  if (fs.existsSync(joined)) return true;
  return false;
}

async function resolvePracticeDefAttachment(ref) {
  if (!ref) return null;
  const has =
    ref.attachmentId ||
    (ref.attachmentMysqlId != null && ref.attachmentMysqlId !== "") ||
    (ref.storedPath && String(ref.storedPath).trim());
  if (!has) return null;
  if (ref.attachmentId) {
    const att = await Attachment.findById(ref.attachmentId).lean();
    if (att) return { attachment: att, ref };
  }
  if (ref.attachmentMysqlId != null && ref.attachmentMysqlId !== "") {
    const att = await Attachment.findOne({ mysqlId: Number(ref.attachmentMysqlId) }).lean();
    if (att) return { attachment: att, ref };
  }
  if (ref.storedPath) return { attachment: null, ref };
  return null;
}

async function removePracticeDefFileStorage(ref) {
  if (!ref) return;
  if (ref.attachmentId) {
    const att = await Attachment.findById(ref.attachmentId);
    if (att?.filepath) {
      const isOurS3 = att.filepath.startsWith(`${S3_PREFIX}/`);
      if (s3Config.isConfigured && isOurS3) {
        try {
          await deleteFromS3(att.filepath);
        } catch (_) {
          /* ignore */
        }
      }
    }
    await Attachment.deleteOne({ _id: ref.attachmentId }).catch(() => {});
  }
  if (ref.storedPath) safeUnlink(ref.storedPath);
}

/**
 * Sube a S3 + Attachment, o guarda en disco local si S3 no está configurado.
 * Soporta multer memoryStorage (buffer) o disco (path).
 */
async function savePracticeDefFile(file, docMongoId, role) {
  if (!file) return null;
  const originalName = String(file.originalname || file.filename || "archivo").slice(0, 500);
  const ext = path.extname(originalName) || ".bin";
  const ct = file.mimetype || "application/octet-stream";

  let buffer = Buffer.isBuffer(file.buffer) ? file.buffer : null;
  if (!buffer?.length && file.path) {
    try {
      buffer = fs.readFileSync(file.path);
    } catch (_) {
      buffer = null;
    }
  }
  if (!buffer?.length) return null;

  if (s3Config.isConfigured) {
    const safe = `${role}-${uuidv4()}${ext}`;
    const key = `${S3_PREFIX}/${docMongoId}/${safe}`;
    await uploadToS3(key, buffer, { contentType: ct });
    if (file.path) {
      try {
        fs.unlinkSync(file.path);
      } catch (_) {
        /* ignore */
      }
    }
    const att = await Attachment.create({
      name: originalName,
      contentType: ct,
      filepath: key,
      status: "ACTIVE",
    });
    return {
      storedPath: "",
      originalName,
      attachmentMysqlId: null,
      attachmentId: att._id,
    };
  }

  const destDir = path.join(process.cwd(), "src", "uploads", UPLOAD_SUBDIR);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const fname = `${uuidv4()}${ext}`;
  const destAbs = path.join(destDir, fname);
  fs.writeFileSync(destAbs, buffer);
  if (file.path) {
    try {
      fs.unlinkSync(file.path);
    } catch (_) {
      /* ignore */
    }
  }
  const rel = path.join(UPLOAD_SUBDIR, fname).replace(/\\/g, "/");
  return {
    storedPath: rel,
    originalName,
    attachmentMysqlId: null,
    attachmentId: null,
  };
}

async function resolveFileAccess(ref) {
  const resolved = await resolvePracticeDefAttachment(ref);
  if (!resolved) return null;
  const { attachment: att, ref: r } = resolved;

  if (r.storedPath) {
    const full = absUploadPath(r.storedPath);
    if (full && fs.existsSync(full)) {
      return {
        kind: "stream",
        absPath: full,
        filename: r.originalName || "archivo",
        contentType: "application/octet-stream",
      };
    }
  }

  if (att) {
    if (isLikelyLocalFilesystemPath(att.filepath)) {
      const p = path.isAbsolute(att.filepath)
        ? att.filepath
        : path.join(process.cwd(), "src", "uploads", att.filepath.replace(/^\//, ""));
      const tryPaths = [p, att.filepath, path.join(process.cwd(), att.filepath)].filter(Boolean);
      for (const tryP of tryPaths) {
        if (tryP && fs.existsSync(tryP)) {
          return {
            kind: "stream",
            absPath: path.resolve(tryP),
            filename: att.name || r.originalName || "archivo",
            contentType: att.contentType || "application/octet-stream",
          };
        }
      }
    }
    if (s3Config.isConfigured && att.filepath) {
      try {
        const url = await getSignedDownloadUrl(att.filepath, 900);
        return {
          kind: "url",
          url,
          filename: att.name || r.originalName || "archivo",
        };
      } catch (_) {
        /* continuar */
      }
    }
  }

  return null;
}

export async function createDocumentPracticeDefinition(req, res) {
  try {
    const {
      documentTypeItemId,
      practiceTypeItemId,
      documentName,
      documentObservation,
      documentOrder,
      programFacultyIds,
    } = req.body;

    if (!documentTypeItemId || !practiceTypeItemId || !documentName) {
      return res.status(400).json({
        success: false,
        message: "Tipo de documento, tipo de práctica y nombre son obligatorios.",
      });
    }

    const pfIds = parseIds(programFacultyIds);
    if (pfIds.length === 0) {
      return res.status(400).json({ success: false, message: "Debe asociar al menos un programa." });
    }

    const extIds = parseIds(req.body.extensionItemIds);
    let extensionItems = [];
    let ext = [];
    if (extIds.length > 0) {
      const resolved = await resolveExtensionItems(extIds);
      if (resolved?.error) {
        return res.status(400).json({ success: false, message: resolved.error });
      }
      extensionItems = resolved.extensionItems;
      ext = resolved.extensionCodes;
    } else {
      ext = parseExtensionCodes(req.body.extensionCodes ?? req.body.extensions);
      if (ext.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Seleccione al menos una extensión (ítems L_EXTENSIONS).",
        });
      }
    }

    const order = Number(documentOrder);
    const newId = new mongoose.Types.ObjectId();
    const tpl = req.files?.plantilla?.[0] || req.files?.template?.[0];
    const mod = req.files?.modelo?.[0] || req.files?.model?.[0];
    let templateFile = tpl ? await savePracticeDefFile(tpl, newId, "plantilla") : null;
    let modelFile = mod ? await savePracticeDefFile(mod, newId, "modelo") : null;

    const doc = await DocumentPracticeDefinition.create({
      _id: newId,
      documentTypeItem: documentTypeItemId,
      practiceTypeItem: practiceTypeItemId,
      documentName: String(documentName).trim(),
      documentObservation: String(documentObservation || "").slice(0, 500),
      documentMandatory: parseBool(req.body.documentMandatory),
      documentOrder: Number.isFinite(order) ? order : 0,
      functionalLetter: parseBool(req.body.functionalLetter),
      showFormTracing: parseBool(req.body.showFormTracing),
      bindingAgreement: parseBool(req.body.bindingAgreement),
      requiresAdditionalApproval: parseBool(req.body.requiresAdditionalApproval),
      programFaculties: pfIds,
      extensionItems,
      extensionCodes: ext,
      templateFile,
      modelFile,
    });

    const populated = await DocumentPracticeDefinition.findById(doc._id).populate(populateList).lean();
    res.status(201).json({ success: true, data: populated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function updateDocumentPracticeDefinition(req, res) {
  try {
    const doc = await DocumentPracticeDefinition.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "No encontrado" });

    const {
      documentTypeItemId,
      practiceTypeItemId,
      documentName,
      documentObservation,
      documentOrder,
      programFacultyIds,
    } = req.body;

    if (documentTypeItemId) doc.documentTypeItem = documentTypeItemId;
    if (practiceTypeItemId) doc.practiceTypeItem = practiceTypeItemId;
    if (documentName != null) doc.documentName = String(documentName).trim();
    if (documentObservation != null) doc.documentObservation = String(documentObservation).slice(0, 500);
    if (documentOrder != null) {
      const o = Number(documentOrder);
      if (Number.isFinite(o)) doc.documentOrder = o;
    }

    doc.documentMandatory = parseBool(req.body.documentMandatory, doc.documentMandatory);
    doc.functionalLetter = parseBool(req.body.functionalLetter, doc.functionalLetter);
    doc.showFormTracing = parseBool(req.body.showFormTracing, doc.showFormTracing);
    doc.bindingAgreement = parseBool(req.body.bindingAgreement, doc.bindingAgreement);
    doc.requiresAdditionalApproval = parseBool(
      req.body.requiresAdditionalApproval,
      doc.requiresAdditionalApproval
    );

    const pfIds = programFacultyIds != null ? parseIds(programFacultyIds) : null;
    if (pfIds && pfIds.length === 0) {
      return res.status(400).json({ success: false, message: "Debe asociar al menos un programa." });
    }
    if (pfIds) doc.programFaculties = pfIds;

    if (req.body.extensionItemIds != null) {
      const extIds = parseIds(req.body.extensionItemIds);
      if (extIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Seleccione al menos una extensión (ítems L_EXTENSIONS).",
        });
      }
      const resolved = await resolveExtensionItems(extIds);
      if (resolved?.error) {
        return res.status(400).json({ success: false, message: resolved.error });
      }
      doc.extensionItems = resolved.extensionItems;
      doc.extensionCodes = resolved.extensionCodes;
    } else if (req.body.extensionCodes != null || req.body.extensions != null) {
      const ext = parseExtensionCodes(req.body.extensionCodes ?? req.body.extensions);
      if (ext.length === 0) {
        return res.status(400).json({ success: false, message: "Indique al menos una extensión permitida." });
      }
      doc.extensionCodes = ext;
      doc.extensionItems = [];
    }

    const plantilla = req.files?.plantilla?.[0] || req.files?.template?.[0];
    if (plantilla) {
      await removePracticeDefFileStorage(doc.templateFile);
      const tplRef = await savePracticeDefFile(plantilla, doc._id, "plantilla");
      if (tplRef) {
        doc.templateFile = tplRef;
        doc.markModified("templateFile");
      }
    }

    const modelo = req.files?.modelo?.[0] || req.files?.model?.[0];
    if (modelo) {
      await removePracticeDefFileStorage(doc.modelFile);
      const modRef = await savePracticeDefFile(modelo, doc._id, "modelo");
      if (modRef) {
        doc.modelFile = modRef;
        doc.markModified("modelFile");
      }
    }

    await doc.save();
    const populated = await DocumentPracticeDefinition.findById(doc._id).populate(populateList).lean();
    res.json({ success: true, data: populated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function deleteDocumentPracticeDefinition(req, res) {
  try {
    const doc = await DocumentPracticeDefinition.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "No encontrado" });

    await removePracticeDefFileStorage(doc.templateFile);
    await removePracticeDefFileStorage(doc.modelFile);

    await doc.deleteOne();
    res.json({ success: true, message: "Eliminado" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

/**
 * GET acceso a plantilla/modelo: URL firmada S3 o indicación de stream local.
 * kind: plantilla | modelo
 */
export async function getPracticeDefFileAccess(req, res) {
  try {
    const doc = await DocumentPracticeDefinition.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "No encontrado" });
    await enrichPracticeDefFiles(doc);
    const kind = String(req.params.kind || "").toLowerCase();
    const ref = kind === "modelo" ? doc.modelFile : doc.templateFile;
    const access = await resolveFileAccess(ref);
    if (!access) {
      return res.status(404).json({
        success: false,
        message: "Archivo no disponible o aún no subido a almacenamiento accesible.",
      });
    }
    if (access.kind === "url") {
      return res.json({ success: true, url: access.url, filename: access.filename });
    }
    return res.json({ success: true, stream: true, filename: access.filename });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function streamPracticeDefFile(req, res) {
  try {
    const doc = await DocumentPracticeDefinition.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "No encontrado" });
    await enrichPracticeDefFiles(doc);
    const kind = String(req.params.kind || "").toLowerCase();
    const ref = kind === "modelo" ? doc.modelFile : doc.templateFile;
    const access = await resolveFileAccess(ref);
    if (!access || access.kind !== "stream") {
      return res.status(404).json({ success: false, message: "No se puede transmitir este archivo por aquí." });
    }
    const encoded = encodeURIComponent(access.filename || "archivo").replace(/'/g, "%27");
    res.setHeader("Content-Type", access.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encoded}`);
    return res.sendFile(access.absPath, (err) => {
      if (err && !res.headersSent) res.status(500).json({ success: false, message: err.message });
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}
