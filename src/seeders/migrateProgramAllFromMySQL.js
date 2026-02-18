/**
 * Migra la tabla MySQL `program_all` (tenant-1.sql) a la colección MongoDB `program_alls`.
 * Requiere tener migrados los items (type_practice_id -> item.id).
 * Uso: node src/seeders/migrateProgramAllFromMySQL.js
 */
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import ProgramAll from "../modules/shared/programAll/programAll.schema.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";

dotenv.config();

const runQuery = (sql, params = []) =>
  query(sql, params).catch((err) => {
    if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  });

async function migrate() {
  console.log("Migracion program_all: MySQL -> MongoDB\n");
  await connectDB();
  await connectMySQL();

  const items = await Item.find({}).select("_id mysqlId").lean();
  const itemByMysqlId = new Map(items.filter((i) => i.mysqlId != null).map((i) => [i.mysqlId, i._id]));

  const existing = await ProgramAll.find({}).select("mysqlId").lean();
  const existingMysqlIds = new Set(existing.filter((p) => p.mysqlId != null).map((p) => p.mysqlId));

  const rows = await runQuery(
    "SELECT id, code, name, level, label_level, status, type_practice_id, date_creation, user_creator, date_update, user_updater FROM `program_all` ORDER BY id"
  );
  console.log("Registros en MySQL program_all:", rows.length);

  let created = 0;
  let skipped = 0;

  for (const r of rows) {
    const mysqlId = r.id != null ? Number(r.id) : null;
    if (mysqlId != null && existingMysqlIds.has(mysqlId)) {
      skipped++;
      continue;
    }
    const typePracticeId = r.type_practice_id != null ? itemByMysqlId.get(Number(r.type_practice_id)) : null;
    await ProgramAll.create({
      mysqlId: mysqlId ?? null,
      code: r.code ?? null,
      name: r.name != null ? String(r.name).trim() : "",
      level: r.level != null ? String(r.level).trim() : "",
      labelLevel: r.label_level ?? null,
      status: r.status ?? null,
      typePractice: typePracticeId ?? null,
      dateCreation: r.date_creation ?? null,
      userCreator: r.user_creator ?? null,
      dateUpdate: r.date_update ?? null,
      userUpdater: r.user_updater ?? null,
    });
    created++;
    if (mysqlId != null) existingMysqlIds.add(mysqlId);
  }

  console.log("Creados:", created, "omitidos:", skipped);
  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Error:", err);
  closePool().catch(() => {});
  process.exit(1);
});
