/**
 * Migración de usuarios administrativos desde MySQL (tenant-1) a MongoDB.
 *
 * Flujo:
 * 1) Migrar roles desde MySQL (role) a MongoDB (Rol) con mysqlId para el mapeo.
 * 2) Consultar user_role: los usuarios que tienen al menos un rol se consideran administrativos.
 * 3) Obtener datos de esos usuarios en MySQL (tabla user).
 * 4) En MongoDB: buscar User por correo (personal_email o user_name) para identificar al usuario.
 * 5) Crear documentos en la colección UserAdministrativo (user, nombres, apellidos, identificacion, roles, etc.).
 * 6) Actualizar en User solo los administrativos: modulo = "administrativo", directorioActivo = true.
 *
 * Requisitos: ejecutar después de migrateUsersFromMySQL.js para que los User existan en Mongo.
 * Uso: node src/seeders/migrateAdministrativosFromMySQL.js
 */

import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Rol from "../modules/roles/roles.model.js";
import User from "../modules/users/user.model.js";
import UserAdministrativo from "../modules/usersAdministrativos/userAdministrativo.model.js";
import Sucursal from "../modules/sucursales/sucursal.model.js";
import Program from "../modules/program/model/program.model.js";

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
  return Number.isNaN(n) ? null : n;
}

function str(v) {
  return v != null ? String(v).trim() : null;
}

async function migrate() {
  console.log("🔄 Migración usuarios administrativos: MySQL (tenant-1) → MongoDB\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}\n`);

  // ─── 1) Migrar roles y construir mapa role_id (MySQL) → Rol._id (Mongo) ───
  const mysqlRoles = await runQuery("SELECT id, name FROM `role` ORDER BY id");
  console.log(`📥 Roles en MySQL: ${mysqlRoles.length}`);

  const rolByMysqlId = new Map();
  let rolesCreated = 0;
  let rolesSkipped = 0;

  for (const r of mysqlRoles) {
    const mysqlId = num(r.id);
    const nombre = str(r.name) || `Rol-${mysqlId}`;

    let rol = await Rol.findOne({ mysqlId }).lean();
    if (rol) {
      rolByMysqlId.set(mysqlId, rol._id);
      rolesSkipped++;
      continue;
    }
    rol = await Rol.findOne({ nombre }).lean();
    if (rol) {
      await Rol.updateOne({ _id: rol._id }, { $set: { mysqlId } });
      rolByMysqlId.set(mysqlId, rol._id);
      rolesSkipped++;
      continue;
    }
    const newRol = await Rol.create({ mysqlId, nombre, estado: true });
    rolByMysqlId.set(mysqlId, newRol._id);
    rolesCreated++;
  }

  console.log(`   ✅ Roles creados: ${rolesCreated}, ya existían: ${rolesSkipped}\n`);

  // ─── 2) user_role: usuarios que tienen al menos un rol (administrativos). Un usuario puede tener varios roles. ───
  const userRoleRows = await runQuery("SELECT user_id, role_id FROM `user_role` ORDER BY user_id");
  console.log(`📥 Filas en user_role: ${userRoleRows.length}`);

  const adminUserIds = new Set(userRoleRows.map((ur) => num(ur.user_id)).filter(Boolean));
  const userRolesMap = new Map();
  for (const ur of userRoleRows) {
    const uid = num(ur.user_id);
    const rid = num(ur.role_id);
    if (uid == null || rid == null) continue;
    if (!userRolesMap.has(uid)) userRolesMap.set(uid, new Set());
    userRolesMap.get(uid).add(rid);
  }
  for (const [uid, setRids] of userRolesMap) {
    userRolesMap.set(uid, [...setRids]);
  }

  console.log(`   Usuarios administrativos (con al menos un rol): ${adminUserIds.size}\n`);

  if (adminUserIds.size === 0) {
    console.log("   No hay usuarios con roles. Fin.");
    await closePool();
    process.exit(0);
    return;
  }

  // ─── 2b) user_branch y user_program para completar sucursal y programas ───
  const ids = [...adminUserIds];
  const placeholders = ids.map(() => "?").join(",");
  const userBranchRows = await runQuery(
    `SELECT user_id, branch_id FROM user_branch WHERE user_id IN (${placeholders})`,
    ids
  );
  const userProgramRows = await runQuery(
    `SELECT user_id, program_id FROM user_program WHERE user_id IN (${placeholders})`,
    ids
  );

  const userBranchMap = new Map();
  for (const ub of userBranchRows) {
    const uid = num(ub.user_id);
    const bid = num(ub.branch_id);
    if (uid == null || bid == null) continue;
    if (!userBranchMap.has(uid)) userBranchMap.set(uid, []);
    userBranchMap.get(uid).push(bid);
  }
  const userProgramMap = new Map();
  for (const up of userProgramRows) {
    const uid = num(up.user_id);
    const pid = num(up.program_id);
    if (uid == null || pid == null) continue;
    if (!userProgramMap.has(uid)) userProgramMap.set(uid, []);
    userProgramMap.get(uid).push(pid);
  }

  const branchIds = [...new Set(userBranchRows.map((ub) => num(ub.branch_id)).filter(Boolean))];
  const programIds = [...new Set(userProgramRows.map((up) => num(up.program_id)).filter(Boolean))];

  const sucursales = await Sucursal.find({ branchId: { $in: branchIds } }).select("_id branchId").lean();
  const sucursalByBranchId = new Map(sucursales.map((s) => [s.branchId, s._id]));

  const programs = await Program.find({ mysqlId: { $in: programIds } }).select("_id mysqlId").lean();
  const programByMysqlId = new Map(programs.map((p) => [p.mysqlId, p._id]));

  // ─── 3) Datos de usuarios en MySQL (solo los administrativos) ───
  const mysqlUsers = await runQuery(
    `SELECT id, name, last_name, user_name, personal_email, identification, phone, movil, user_creator, user_updater FROM \`user\` WHERE id IN (${placeholders})`,
    ids
  );
  console.log(`📥 Usuarios administrativos en MySQL: ${mysqlUsers.length}\n`);

  const mongoUsers = await User.find({}).select("_id email code mysqlId").lean();
  const userByEmail = new Map(mongoUsers.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
  const userByCode = new Map(mongoUsers.filter((u) => u.code).map((u) => [String(u.code).trim(), u]));
  const userByMysqlId = new Map(mongoUsers.filter((u) => u.mysqlId != null).map((u) => [u.mysqlId, u]));

  const existingAdminByUser = new Map(
    (await UserAdministrativo.find({}).select("user").lean()).map((ua) => [ua.user.toString(), ua])
  );

  let adminsCreated = 0;
  let adminsSkipped = 0;
  let usersUpdated = 0;
  let notFoundInMongo = 0;

  for (const mu of mysqlUsers) {
    const mysqlUserId = num(mu.id);
    const email = str(mu.personal_email) || str(mu.user_name);
    const code = str(mu.identification) || str(mu.user_name) || (mysqlUserId != null ? String(mysqlUserId) : null);
    const nombres = str(mu.name) || "Nombres";
    const apellidos = str(mu.last_name) || "Apellidos";
    const identificacion = str(mu.identification) || (mysqlUserId != null ? `MIG-${mysqlUserId}` : `MIG-${Date.now()}`);
    const phone = str(mu.phone) || str(mu.movil) || undefined;
    const userCreator = str(mu.user_creator) || undefined;
    const userUpdater = str(mu.user_updater) || undefined;

    let mongoUser =
      userByMysqlId.get(mysqlUserId) ||
      (email ? userByEmail.get(email.toLowerCase()) : null) ||
      (code ? userByCode.get(code) : null);

    if (!mongoUser) {
      notFoundInMongo++;
      console.warn(`   ⚠️ Usuario MySQL id=${mysqlUserId} (${email || code}) no encontrado en MongoDB User. Omitido.`);
      continue;
    }

    if (existingAdminByUser.has(mongoUser._id.toString())) {
      adminsSkipped++;
      continue;
    }

    const roleIds = userRolesMap.get(mysqlUserId) || [];
    const mongoRoleIds = [...new Set(roleIds.map((rid) => rolByMysqlId.get(rid)).filter(Boolean))];
    const roles = mongoRoleIds.map((rolId) => ({ rol: rolId, estado: true }));

    const branchIdsForUser = userBranchMap.get(mysqlUserId) || [];
    const sucursalId = branchIdsForUser.map((bid) => sucursalByBranchId.get(bid)).find(Boolean) || null;

    const programIdsForUser = userProgramMap.get(mysqlUserId) || [];
    const programas = programIdsForUser
      .map((pid) => programByMysqlId.get(pid))
      .filter(Boolean)
      .map((programId) => ({ program: programId, estado: true }));

    await UserAdministrativo.create({
      user: mongoUser._id,
      nombres,
      apellidos,
      identificacion,
      phone,
      roles,
      sucursal: sucursalId || undefined,
      programas,
      estado: true,
      userCreator,
      userUpdater,
    });
    existingAdminByUser.set(mongoUser._id.toString(), true);
    adminsCreated++;

    await User.updateOne(
      { _id: mongoUser._id },
      { $set: { modulo: "administrativo", directorioActivo: true } }
    );
    usersUpdated++;
  }

  console.log("   ✅ UserAdministrativo creados:", adminsCreated);
  console.log("   ⏭️  Ya existían (omitidos):", adminsSkipped);
  console.log("   ✅ User actualizados (modulo + directorioActivo):", usersUpdated);
  console.log("   ⚠️ No encontrados en MongoDB User:", notFoundInMongo);
  console.log("\n✅ Migración de administrativos finalizada.");

  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Error:", err);
  closePool().catch(() => {});
  process.exit(1);
});
