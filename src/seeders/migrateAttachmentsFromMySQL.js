/**
 * Migra la tabla MySQL `attachment` (tenant-1.sql) a la colección MongoDB `attachments`.
 * Usa insertMany por lotes para mayor velocidad.
 * Uso: node src/seeders/migrateAttachmentsFromMySQL.js
 */
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Attachment from "../modules/shared/attachment/attachment.schema.js";

dotenv.config();

const BATCH_SIZE = 2000;
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

async function migrate() {
  console.log("🔄 Migración attachment: MySQL → MongoDB (por lotes)\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}, lote: ${BATCH_SIZE}\n`);

  const existing = await Attachment.find({}).select("mysqlId").lean();
  const existingMysqlIds = new Set(existing.filter((a) => a.mysqlId != null).map((a) => a.mysqlId));

  let lastId = 0;
  let created = 0;
  let skipped = 0;

  while (true) {
    const rows = await runQuery(
      `SELECT id, name, content_type, filepath, status, downloaded, date_creation, user_creator, date_update, user_updater FROM \`attachment\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastId]
    );
    if (!rows || rows.length === 0) break;

    const toInsert = [];
    for (const r of rows) {
      const mysqlId = num(r.id);
      if (mysqlId != null) lastId = mysqlId;
      if (mysqlId != null && existingMysqlIds.has(mysqlId)) {
        skipped++;
        continue;
      }
      toInsert.push({
        mysqlId: mysqlId ?? null,
        name: r.name != null ? String(r.name) : "",
        contentType: r.content_type != null ? String(r.content_type) : "",
        filepath: r.filepath != null ? String(r.filepath) : "",
        status: r.status != null ? String(r.status) : "",
        downloaded: r.downloaded != null ? Boolean(r.downloaded) : null,
        dateCreation: r.date_creation ?? null,
        userCreator: r.user_creator ?? null,
        dateUpdate: r.date_update ?? null,
        userUpdater: r.user_updater ?? null,
      });
      if (mysqlId != null) existingMysqlIds.add(mysqlId);
    }

    if (toInsert.length > 0) {
      await Attachment.insertMany(toInsert);
      created += toInsert.length;
      console.log(`   📦 Lote: ${toInsert.length} insertados (total: ${created})`);
    }
  }

  console.log(`   ✅ Creados: ${created}, omitidos: ${skipped}\n`);
  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("💥 Error:", err);
  closePool().catch(() => {});
  process.exit(1);
});
