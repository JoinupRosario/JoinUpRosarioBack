/**
 * Migración MySQL → MongoDB: definiciones de documentos para legalizar monitoría.
 *
 * Tablas MySQL (tenant-1.sql):
 * | document_monitoring_definition | mysqlId = document_monitoring_definition_id |
 * | monitoring_allowed_extensions  | migratedExtensionItemMysqlIds[] = item_id   |
 * | attachment (plantilla/modelo)  | templateFile/modelFile.attachmentMysqlId    |
 *
 * Prerrequisitos: migrar items (L_DOCUMENT_TYPE, L_EXTENSIONS), attachments.
 *
 * Uso: node src/seeders/migrateDocumentMonitoringDefinitionFromMySQL.js
 */
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import mongoose from "mongoose";
import DocumentMonitoringDefinition from "../modules/documentMonitoringDefinition/documentMonitoringDefinition.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";
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
  console.log("🔄 Migración document_monitoring_definition (MySQL → MongoDB)\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}\n`);

  const defs = await runQuery(
    `SELECT document_monitoring_definition_id, document_type_id, template_attached_id, model_attached_id,
            document_name, document_observation, document_mandatory, document_order,
            functional_letter, show_form_tracing, status
     FROM document_monitoring_definition ORDER BY document_monitoring_definition_id`
  );

  if (!defs.length) {
    console.log("Sin filas en document_monitoring_definition.");
    await closePool();
    process.exit(0);
  }

  const extByDef = new Map();
  const erows = await runQuery(
    `SELECT document_monitoring_definition_id, item_id FROM monitoring_allowed_extensions`
  );
  for (const r of erows) {
    const id = num(r.document_monitoring_definition_id);
    const it = num(r.item_id);
    if (id == null || it == null) continue;
    if (!extByDef.has(id)) extByDef.set(id, []);
    extByDef.get(id).push(it);
  }

  const defMysqlIds = defs.map((r) => num(r.document_monitoring_definition_id)).filter((id) => id != null);
  const existingMysqlIds = new Set(
    (await DocumentMonitoringDefinition.find({ mysqlId: { $in: defMysqlIds } }).select("mysqlId").lean()).map(
      (d) => d.mysqlId
    )
  );

  const allItemMysqlIds = new Set(defs.map((r) => num(r.document_type_id)).filter(Boolean));
  extByDef.forEach((ids) => ids.forEach((id) => allItemMysqlIds.add(id)));
  const itemsByMysqlId = new Map(
    (await Item.find({ mysqlId: { $in: [...allItemMysqlIds] } }).lean()).map((it) => [it.mysqlId, it])
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
    `   Mongo: ${existingMysqlIds.size} definiciones ya existen, ${itemsByMysqlId.size} ítems, ${attByMysqlId.size} attachments.\n`
  );

  const toCreate = [];
  let skipped = 0;
  let errors = 0;

  for (const row of defs) {
    const mysqlDefId = num(row.document_monitoring_definition_id);
    if (mysqlDefId == null) continue;

    if (existingMysqlIds.has(mysqlDefId)) {
      skipped++;
      continue;
    }

    const docTypeId = num(row.document_type_id);
    const itemDoc = docTypeId != null ? itemsByMysqlId.get(docTypeId) : null;

    if (!itemDoc) {
      console.warn(`⚠️  Def ${mysqlDefId}: falta Item document_type_id=${docTypeId}. Omitida.`);
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
      legacyMysqlStatus: row.status != null ? String(row.status).slice(0, 40) : "",
      documentTypeItem: itemDoc._id,
      documentName: String(row.document_name || "").slice(0, 100),
      documentObservation: row.document_observation != null ? String(row.document_observation).slice(0, 500) : "",
      documentMandatory: bitToBool(row.document_mandatory),
      documentOrder: num(row.document_order) ?? 0,
      showFormTracing: Boolean(Number(row.show_form_tracing)),
      extensionItems: extensionItemsMongo,
      extensionCodes,
      migratedExtensionItemMysqlIds: extMysqlIds,
      templateFile,
      modelFile,
    });
  }

  let created = 0;
  const BATCH = 100;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    try {
      await DocumentMonitoringDefinition.insertMany(batch);
      created += batch.length;
    } catch (e) {
      for (const doc of batch) {
        try {
          await DocumentMonitoringDefinition.create(doc);
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
