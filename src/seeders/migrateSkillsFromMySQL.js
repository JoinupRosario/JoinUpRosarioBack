/**
 * Migra la tabla MySQL `skill` (tenant-1.sql) a la colección MongoDB `skills`.
 * Ejecutar antes de migratePostulantsFromMySQL.js (profile_skill referencia skill_id).
 * Uso: node src/seeders/migrateSkillsFromMySQL.js
 */
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Skill from "../modules/shared/skill/skill.schema.js";

dotenv.config();

const runQuery = (sql, params = []) =>
  query(sql, params).catch((err) => {
    if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  });

async function migrate() {
  console.log("Migracion skill: MySQL -> MongoDB\n");
  await connectDB();
  await connectMySQL();

  const existing = await Skill.find({}).select("mysqlId").lean();
  const existingMysqlIds = new Set(existing.filter((s) => s.mysqlId != null).map((s) => s.mysqlId));

  const rows = await runQuery("SELECT id, name FROM `skill` ORDER BY id");
  console.log("Registros en MySQL skill:", rows.length);

  let created = 0;
  let skipped = 0;

  for (const r of rows) {
    const mysqlId = r.id != null ? Number(r.id) : null;
    if (mysqlId != null && existingMysqlIds.has(mysqlId)) {
      skipped++;
      continue;
    }
    await Skill.create({
      mysqlId: mysqlId ?? null,
      name: r.name != null ? String(r.name).trim() : null,
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
