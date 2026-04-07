/**
 * Migra la tabla MySQL `company_document` a la colección MongoDB `company_documents`.
 *
 * Prerrequisitos: migrateCompaniesFromMySQL, migrateAttachmentsFromMySQL, migrateItemsFromMySQL
 * (o equivalentes) para que existan mysqlId en Company, Attachment e items.
 *
 * Uso: node src/seeders/migrateCompanyDocumentsFromMySQL.js
 */
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Company from "../modules/companies/company.model.js";
import CompanyDocument from "../modules/companies/companyDocument.schema.js";
import Attachment from "../modules/shared/attachment/attachment.schema.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";

dotenv.config();

const BATCH_SIZE = 500;
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

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function dateOrNow(v) {
  if (v == null) return new Date();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function migrate() {
  console.log("🔄 Migración company_document: MySQL → MongoDB\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}, lote: ${BATCH_SIZE}\n`);

  const [companies, attachments, items] = await Promise.all([
    Company.find({ mysqlId: { $ne: null } }).select("_id mysqlId").lean(),
    Attachment.find({ mysqlId: { $ne: null } }).select("_id mysqlId").lean(),
    Item.find({ mysqlId: { $ne: null } }).select("_id mysqlId").lean(),
  ]);

  const companyByMysqlId = new Map(companies.map((c) => [c.mysqlId, c._id]));
  const attachmentByMysqlId = new Map(attachments.map((a) => [a.mysqlId, a._id]));
  const itemByMysqlId = new Map(items.map((i) => [i.mysqlId, i._id]));

  const existingMysqlIds = new Set(
    (await CompanyDocument.find({}).select("mysqlId").lean())
      .map((d) => d.mysqlId)
      .filter((id) => id != null)
  );

  let created = 0;
  let skippedExisting = 0;
  let skippedNoCompany = 0;
  let skippedNoAttachment = 0;
  let skippedNoDocType = 0;
  let skippedNoAggType = 0;

  let lastId = 0;
  while (true) {
    const rows = await runQuery(
      `SELECT id, name, company_id, attachment_id, document_type, aggrement_type,
              aggrement_code, agg_start_date, agg_end_date,
              date_creation, user_creator, date_update, user_updater
       FROM \`company_document\`
       WHERE id > ?
       ORDER BY id
       LIMIT ${BATCH_SIZE}`,
      [lastId]
    );
    if (!rows || rows.length === 0) break;

    const toInsert = [];
    for (const r of rows) {
      const mysqlId = num(r.id);
      if (mysqlId != null) lastId = mysqlId;

      if (mysqlId != null && existingMysqlIds.has(mysqlId)) {
        skippedExisting++;
        continue;
      }

      const companyId = companyByMysqlId.get(num(r.company_id));
      if (!companyId) {
        skippedNoCompany++;
        continue;
      }

      const attachmentId = attachmentByMysqlId.get(num(r.attachment_id));
      if (!attachmentId) {
        skippedNoAttachment++;
        continue;
      }

      const documentType = itemByMysqlId.get(num(r.document_type));
      if (!documentType) {
        skippedNoDocType++;
        continue;
      }

      const agreementType = itemByMysqlId.get(num(r.aggrement_type));
      if (!agreementType) {
        skippedNoAggType++;
        continue;
      }

      const name = str(r.name);
      if (!name) {
        continue;
      }

      toInsert.push({
        mysqlId: mysqlId ?? undefined,
        name,
        companyId,
        attachmentId,
        documentType,
        agreementType,
        agreementCode: r.aggrement_code != null ? str(r.aggrement_code) || null : null,
        agreementStartDate: r.agg_start_date ? new Date(r.agg_start_date) : null,
        agreementEndDate: r.agg_end_date ? new Date(r.agg_end_date) : null,
        dateCreation: dateOrNow(r.date_creation),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: r.date_update ? new Date(r.date_update) : null,
        userUpdater: r.user_updater != null ? str(r.user_updater) || null : null,
      });
      if (mysqlId != null) existingMysqlIds.add(mysqlId);
    }

    if (toInsert.length > 0) {
      await CompanyDocument.insertMany(toInsert);
      created += toInsert.length;
      console.log(`   📦 Lote: ${toInsert.length} insertados (total: ${created})`);
    }
  }

  console.log(`
   ✅ Insertados: ${created}
   ⏭️  Ya existían (mysqlId): ${skippedExisting}
   ⚠️  Sin empresa en Mongo (company_id): ${skippedNoCompany}
   ⚠️  Sin attachment en Mongo: ${skippedNoAttachment}
   ⚠️  Sin item document_type: ${skippedNoDocType}
   ⚠️  Sin item aggrement_type: ${skippedNoAggType}
`);
  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("💥 Error:", err);
  closePool().catch(() => {});
  process.exit(1);
});
