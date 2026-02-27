/**
 * Migración de logs desde MySQL (tenant-1) a MongoDB:
 * - change_status_user → postulant_log_status (log de cambios de estado del postulante/usuario)
 * - document_creation_log → postulant_log_documents (log de creación de documentos)
 *
 * Requisitos: haber ejecutado migrate:users y migrate:postulants para que User y Postulant existan con mysqlId.
 * Uso: node src/seeders/migrateLogsFromMySQL.js
 */

import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import User from "../modules/users/user.model.js";
import Postulant from "../modules/postulants/models/postulants.schema.js";
import postulantLogStatus from "../modules/postulants/models/logs/postulantLogStatus.schema.js";
import PostulantDocument from "../modules/postulants/models/logs/postulantLogDocumentSchema.js";

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
  console.log("🔄 Migración logs: MySQL (tenant-1) → MongoDB\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}\n`);

  // ─── Mapas: user_id (MySQL) → Postulant._id (solo usuarios que son postulantes) ───
  const users = await User.find({ mysqlId: { $exists: true, $ne: null } }).select("_id mysqlId email code name").lean();
  const userByMysqlId = new Map(users.map((u) => [u.mysqlId, u]));

  const postulants = await Postulant.find({}).select("_id postulantId").lean();
  const postulantByUserId = new Map(postulants.map((p) => [p.postulantId?.toString(), p._id]));

  const getPostulantIdForMysqlUserId = (mysqlUserId) => {
    const user = userByMysqlId.get(num(mysqlUserId));
    if (!user) return null;
    return postulantByUserId.get(user._id.toString()) ?? null;
  };

  // ─── 1) change_status_user → postulant_log_status ───
  const statusRows = await runQuery(
    "SELECT id, user_id, status_before, status_after, reason, date_creation, user_creator, user_type FROM `change_status_user` ORDER BY id"
  );
  console.log(`📥 change_status_user en MySQL: ${statusRows.length}`);

  const existingStatusMysqlIds = new Set(
    (await postulantLogStatus.find({ mysqlId: { $ne: null } }).select("mysqlId").lean()).map((d) => d.mysqlId)
  );

  let statusCreated = 0;
  let statusSkipped = 0;
  let statusNoPostulant = 0;

  for (const row of statusRows) {
    const mysqlId = num(row.id);
    if (mysqlId != null && existingStatusMysqlIds.has(mysqlId)) {
      statusSkipped++;
      continue;
    }

    const postulantId = getPostulantIdForMysqlUserId(row.user_id);
    if (!postulantId) {
      statusNoPostulant++;
      continue;
    }

    const userCreator = str(row.user_creator);
    let changedById = null;
    if (userCreator) {
      const u = await User.findOne({
        $or: [
          { email: { $regex: new RegExp(`^${userCreator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
          { code: userCreator },
        ],
      })
        .select("_id")
        .lean();
      if (u) changedById = u._id;
    }

    const dateCreation = row.date_creation ? new Date(row.date_creation) : new Date();

    await postulantLogStatus.create({
      mysqlId: mysqlId ?? undefined,
      postulant: postulantId,
      status_before: str(row.status_before) || undefined,
      status_after: str(row.status_after) || "—",
      reason: str(row.reason) || undefined,
      changed_by: changedById ?? undefined,
      user_type: str(row.user_type) || undefined,
      createdAt: dateCreation,
      updatedAt: dateCreation,
    });
    if (mysqlId != null) existingStatusMysqlIds.add(mysqlId);
    statusCreated++;
  }

  console.log(`   ✅ Logs de estado: creados ${statusCreated}, ya existían ${statusSkipped}, sin postulante en Mongo ${statusNoPostulant}\n`);

  // ─── 2) document_creation_log → postulant_log_documents ───
  const docRows = await runQuery(
    "SELECT id, user_id, document_type, content, observations, date_creation FROM `document_creation_log` ORDER BY id"
  );
  console.log(`📥 document_creation_log en MySQL: ${docRows.length}`);

  const existingDocMysqlIds = new Set(
    (await PostulantDocument.find({ mysqlId: { $ne: null } }).select("mysqlId").lean()).map((d) => d.mysqlId)
  );

  let docCreated = 0;
  let docSkipped = 0;
  let docNoPostulant = 0;

  for (const row of docRows) {
    const mysqlId = num(row.id);
    if (mysqlId != null && existingDocMysqlIds.has(mysqlId)) {
      docSkipped++;
      continue;
    }

    const postulantId = getPostulantIdForMysqlUserId(row.user_id);
    if (!postulantId) {
      docNoPostulant++;
      continue;
    }

    const dateCreation = row.date_creation ? new Date(row.date_creation) : new Date();

    await PostulantDocument.create({
      mysqlId: mysqlId ?? undefined,
      postulant: postulantId,
      document_type: str(row.document_type) || "other",
      content: str(row.content) ? str(row.content).substring(0, 500) : undefined,
      observations: str(row.observations) ? str(row.observations).substring(0, 256) : undefined,
      created_by: undefined,
      createdAt: dateCreation,
      updatedAt: dateCreation,
    });
    if (mysqlId != null) existingDocMysqlIds.add(mysqlId);
    docCreated++;
  }

  console.log(`   ✅ Logs de documentos: creados ${docCreated}, ya existían ${docSkipped}, sin postulante en Mongo ${docNoPostulant}\n`);

  await closePool();
  console.log("✅ Migración de logs finalizada.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
