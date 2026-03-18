/**
 * Migración MySQL → MongoDB: definiciones de documentos para legalizar práctica académica.
 *
 * Tablas MySQL (tenant-1.sql) y mysqlId que se conservan en Mongo:
 *
 * | Tabla MySQL                    | Clave / campo mysqlId en Mongo                          |
 * |-------------------------------|---------------------------------------------------------|
 * | document_practice_definition  | mysqlId = document_practice_definition_id (PK)          |
 * | document_practice_def_program   | migratedProgramFacultyMysqlIds[] = program_faculty_id |
 * | allowed_extensions            | migratedExtensionItemMysqlIds[] = item_id             |
 * | attachment (plantilla/modelo) | templateFile/modelFile.attachmentMysqlId = attachment.id |
 * | item (document_type, practice) | Ref por ObjectId; items deben tener mysqlId = item.id |
 * | program_faculty               | Ref ProgramFaculty con mysqlId = program_faculty_id     |
 *
 * Prerrequisitos: migrar items, program_faculties, attachments (migrateAttachmentsFromMySQL.js).
 *
 * Uso: node src/seeders/migrateDocumentPracticeDefinitionFromMySQL.js
 */
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import mongoose from "mongoose";
import DocumentPracticeDefinition from "../modules/documentPracticeDefinition/documentPracticeDefinition.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";
import ProgramFaculty from "../modules/program/model/programFaculty.model.js";
import Attachment from "../modules/shared/attachment/attachment.schema.js";

dotenv.config();

const dbName = process.env.MYSQL_DATABASE || "tenant-1";

const runQuery = (sql, params = []) =>
  query(sql, params).catch((err) => {
    if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  });

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bitToBool(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (Buffer.isBuffer(v)) return v[0] === 1;
  return Number(v) === 1;
}

async function migrate() {
  console.log("🔄 Migración document_practice_definition (MySQL → MongoDB)\n");
  console.log("mysqlId por tabla de origen: ver cabecera de este archivo.\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}\n`);

  const defs = await runQuery(
    `SELECT document_practice_definition_id, document_type_id, template_attached_id, model_attached_id,
            document_name, document_observation, document_mandatory, document_order, practice_type,
            functional_letter, show_form_tracing, binding_agreement
     FROM document_practice_definition ORDER BY document_practice_definition_id`
  );

  if (!defs.length) {
    console.log("Sin filas en document_practice_definition.");
    await closePool();
    process.exit(0);
  }

  const programsByDef = new Map();
  const prows = await runQuery(
    `SELECT document_practice_definition_id, program_faculty_id FROM document_practice_def_program`
  );
  for (const r of prows) {
    const id = num(r.document_practice_definition_id);
    const pf = num(r.program_faculty_id);
    if (id == null || pf == null) continue;
    if (!programsByDef.has(id)) programsByDef.set(id, []);
    programsByDef.get(id).push(pf);
  }

  const extByDef = new Map();
  const erows = await runQuery(`SELECT document_practice_definition_id, item_id FROM allowed_extensions`);
  for (const r of erows) {
    const id = num(r.document_practice_definition_id);
    const it = num(r.item_id);
    if (id == null || it == null) continue;
    if (!extByDef.has(id)) extByDef.set(id, []);
    extByDef.get(id).push(it);
  }

  // ── Preload Mongo en pocas consultas (evita N+1) ─────────────────────────────
  const defMysqlIds = defs.map((r) => num(r.document_practice_definition_id)).filter((id) => id != null);
  const existingMysqlIds = new Set(
    (await DocumentPracticeDefinition.find({ mysqlId: { $in: defMysqlIds } }).select("mysqlId").lean()).map(
      (d) => d.mysqlId
    )
  );

  const allItemMysqlIds = new Set(defs.map((r) => num(r.document_type_id)).filter(Boolean));
  defs.forEach((r) => allItemMysqlIds.add(num(r.practice_type)));
  extByDef.forEach((ids) => ids.forEach((id) => allItemMysqlIds.add(id)));
  const itemsByMysqlId = new Map(
    (await Item.find({ mysqlId: { $in: [...allItemMysqlIds] } }).lean()).map((it) => [it.mysqlId, it])
  );

  const allPfMysqlIds = [...new Set(Array.from(programsByDef.values()).flat())];
  const pfByMysqlId = new Map(
    (await ProgramFaculty.find({ mysqlId: { $in: allPfMysqlIds } }).select("_id mysqlId").lean()).map((p) => [
      p.mysqlId,
      p,
    ])
  );

  const allAttMysqlIds = [
    ...new Set(defs.flatMap((r) => [num(r.template_attached_id), num(r.model_attached_id)].filter(Boolean))),
  ];
  const attByMysqlId = new Map(
    (await Attachment.find({ mysqlId: { $in: allAttMysqlIds } }).select("_id mysqlId name").lean()).map((a) => [
      a.mysqlId,
      a,
    ])
  );

  console.log(
    `   Mongo: ${existingMysqlIds.size} definiciones ya existen, ${itemsByMysqlId.size} ítems, ${pfByMysqlId.size} program_faculties, ${attByMysqlId.size} attachments.\n`
  );

  const toCreate = [];
  let skipped = 0;
  let errors = 0;

  for (const row of defs) {
    const mysqlDefId = num(row.document_practice_definition_id);
    if (mysqlDefId == null) continue;

    if (existingMysqlIds.has(mysqlDefId)) {
      skipped++;
      continue;
    }

    const docTypeId = num(row.document_type_id);
    const practiceTypeId = num(row.practice_type);
    const itemDoc = docTypeId != null ? itemsByMysqlId.get(docTypeId) : null;
    const itemPrac = practiceTypeId != null ? itemsByMysqlId.get(practiceTypeId) : null;

    if (!itemDoc || !itemPrac) {
      console.warn(
        `⚠️  Def ${mysqlDefId}: falta Item (document_type_id=${docTypeId} → ${!!itemDoc}, practice_type=${practiceTypeId} → ${!!itemPrac}). Omitida.`
      );
      errors++;
      continue;
    }

    const pfMysqlIds = programsByDef.get(mysqlDefId) || [];
    const pfMongoIds = [];
    const missingPf = [];
    for (const pfMid of pfMysqlIds) {
      const pf = pfByMysqlId.get(pfMid);
      if (pf) pfMongoIds.push(pf._id);
      else missingPf.push(pfMid);
    }
    if (pfMongoIds.length === 0) {
      console.warn(`⚠️  Def ${mysqlDefId}: sin program_faculty resuelto en Mongo. Omitida.`);
      errors++;
      continue;
    }

    const extMysqlIds = extByDef.get(mysqlDefId) || [];
    const extensionCodes = [];
    const extensionItemsMongo = [];
    for (const eid of extMysqlIds) {
      const it = itemsByMysqlId.get(eid);
      if (it?._id) extensionItemsMongo.push(it._id);
      if (it?.value) {
        extensionCodes.push(String(it.value).replace(/^\./, "").trim().toLowerCase());
      } else {
        extensionCodes.push(`item_${eid}`);
      }
    }
    if (extensionCodes.length === 0) extensionCodes.push("pdf");

    const tplId = num(row.template_attached_id);
    const modId = num(row.model_attached_id);
    let templateFile = null;
    let modelFile = null;
    if (tplId != null) {
      const att = attByMysqlId.get(tplId);
      templateFile = {
        storedPath: "",
        originalName: att?.name || "",
        attachmentMysqlId: tplId,
        attachmentId: att?._id || null,
      };
    }
    if (modId != null) {
      const att = attByMysqlId.get(modId);
      modelFile = {
        storedPath: "",
        originalName: att?.name || "",
        attachmentMysqlId: modId,
        attachmentId: att?._id || null,
      };
    }

    toCreate.push({
      mysqlId: mysqlDefId,
      documentTypeItem: itemDoc._id,
      practiceTypeItem: itemPrac._id,
      documentName: String(row.document_name || "").slice(0, 100),
      documentObservation: row.document_observation != null ? String(row.document_observation).slice(0, 500) : "",
      documentMandatory: bitToBool(row.document_mandatory),
      documentOrder: num(row.document_order) ?? 0,
      functionalLetter: Boolean(Number(row.functional_letter)),
      showFormTracing: Boolean(Number(row.show_form_tracing)),
      bindingAgreement: row.binding_agreement != null ? Boolean(Number(row.binding_agreement)) : false,
      requiresAdditionalApproval: false,
      programFaculties: pfMongoIds,
      extensionItems: extensionItemsMongo,
      extensionCodes,
      migratedProgramFacultyMysqlIds: pfMysqlIds,
      migratedExtensionItemMysqlIds: extMysqlIds,
      templateFile,
      modelFile,
    });
    if (missingPf.length) {
      console.warn(`   Def ${mysqlDefId}: programas no resueltos (mysqlId): ${missingPf.join(", ")}`);
    }
  }

  let created = 0;
  const BATCH = 100;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    try {
      await DocumentPracticeDefinition.insertMany(batch);
      created += batch.length;
    } catch (e) {
      for (const doc of batch) {
        try {
          await DocumentPracticeDefinition.create(doc);
          created++;
        } catch (err) {
          console.error(`❌ Def ${doc.mysqlId}: ${err.message}`);
          errors++;
        }
      }
    }
  }

  console.log(`\n✅ Creadas: ${created}, ya existían: ${skipped}, errores/omitidas: ${errors}`);
  await closePool();
  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
