/**
 * Migración de user_branch (MySQL) a user_sucursal (MongoDB).
 * - En MongoDB hay una sola Sucursal (o se usa la primera): se obtiene sucursalId.
 * - Por cada user_id en user_branch: se busca User en Mongo por mysqlId === user_id,
 *   se obtiene el _id del User (userId) y se crea UserSucursal({ userId, sucursalId }).
 * No se usa branch_id para buscar sucursal; se relaciona todo usuario de user_branch con esa sucursal.
 *
 * Uso: node src/seeders/migrateUserSucursalFromMySQL.js
 */

import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import User from "../modules/users/user.model.js";
import Sucursal from "../modules/sucursales/sucursal.model.js";
import UserSucursal from "../modules/userSucursal/userSucursal.model.js";

dotenv.config();

const runQuery = (sql, params = []) =>
  query(sql, params).catch((err) => {
    if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  });

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

async function migrate() {
  console.log("🔄 Migración user_branch → user_sucursal (MySQL → MongoDB)\n");
  await connectDB();
  await connectMySQL();

  const rows = await runQuery("SELECT user_id, branch_id FROM user_branch ORDER BY user_id, branch_id");
  console.log(`📥 Filas en user_branch: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log("   No hay filas. Fin.");
    await closePool();
    process.exit(0);
    return;
  }

  // Una sola sucursal en MongoDB: obtener su _id (sucursalId)
  const sucursal = await Sucursal.findOne().select("_id nombre codigo").lean();
  if (!sucursal) {
    console.log("   ❌ No hay ninguna Sucursal en MongoDB. Crea al menos una sucursal y vuelve a ejecutar.");
    await closePool();
    process.exit(1);
  }
  const sucursalId = sucursal._id;
  console.log(`   📍 Sucursal en Mongo: ${sucursal.nombre} (${sucursal.codigo}) → _id: ${sucursalId}\n`);

  // user_id (MySQL) → User en Mongo por mysqlId → _id (userId)
  const userIdsMysql = [...new Set(rows.map((r) => num(r.user_id)).filter(Boolean))];
  const users = await User.find({ mysqlId: { $in: userIdsMysql } }).select("_id mysqlId").lean();
  const userByMysqlId = new Map(users.map((u) => [u.mysqlId, u._id]));

  const uniqueMysqlUserIds = [...new Set(rows.map((r) => num(r.user_id)).filter((id) => id != null))];
  let created = 0;
  let skipped = 0;
  let noUser = 0;

  for (const mysqlUserId of uniqueMysqlUserIds) {
    const mongoUserId = userByMysqlId.get(mysqlUserId);
    if (!mongoUserId) {
      noUser++;
      continue;
    }

    const exists = await UserSucursal.findOne({ userId: mongoUserId, sucursalId });
    if (exists) {
      skipped++;
      continue;
    }

    await UserSucursal.create({ userId: mongoUserId, sucursalId });
    created++;
  }

  console.log("   ✅ Creados:", created);
  console.log("   ⏭️  Ya existían:", skipped);
  console.log("   ⚠️ User no encontrado en Mongo (mysqlId):", noUser);
  console.log("\n✅ Migración user_sucursal finalizada.");

  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Error:", err);
  closePool().catch(() => {});
  process.exit(1);
});
