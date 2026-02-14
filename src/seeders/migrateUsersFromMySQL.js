/**
 * Migración de usuarios desde MySQL (tenant-1) a MongoDB.
 * 1) Actualiza User.mysqlId y contraseña en los que ya existen (match por email o code).
 * 2) Crea usuarios faltantes en MongoDB con mysqlId y contraseña migrada.
 *
 * Contraseñas: se lee la columna password de MySQL, se desencripta con la clave
 * MYSQL_PASSWORD_DECRYPT_KEY y se vuelve a hashear con bcrypt para que el login siga igual.
 *
 * Variables de entorno:
 *   MYSQL_PASSWORD_DECRYPT_KEY  Clave con la que se encriptaron las contraseñas en MySQL (ej. AES). Si no se define, se usa contraseña por defecto.
 *   MYSQL_PASSWORD_PLAIN        Si es "true" o "1", se asume que la columna password está en texto plano (solo se hashea con bcrypt, sin desencriptar).
 *   MYSQL_PASSWORD_CIPHER       Algoritmo (default: aes-256-cbc).
 *   MYSQL_PASSWORD_IV           IV en hex; si no se define, se usa IV incluido en los primeros 16 bytes del dato (formato común).
 *
 * Ejecutar ANTES de migratePostulantsFromMySQL si hay muchos "omitidos sin usuario".
 * Ejecutar: node src/seeders/migrateUsersFromMySQL.js
 */

import dotenv from "dotenv";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import User from "../modules/users/user.model.js";

dotenv.config();

const dbName = process.env.MYSQL_DATABASE || "tenant-1";
const DEFAULT_PASSWORD = "ChangeMe123"; // Solo si no hay clave de desencriptado o falla la desencriptación
const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

const DECRYPT_KEY = process.env.MYSQL_PASSWORD_DECRYPT_KEY?.trim() || null;
const PASSWORD_PLAIN = /^(true|1|yes)$/i.test(process.env.MYSQL_PASSWORD_PLAIN?.trim() || "");
const DECRYPT_CIPHER = process.env.MYSQL_PASSWORD_CIPHER || "aes-256-cbc";
const DECRYPT_IV_HEX = process.env.MYSQL_PASSWORD_IV?.trim() || null;

/**
 * Obtiene la contraseña en claro desde MySQL: si MYSQL_PASSWORD_PLAIN=true es texto plano;
 * si no, desencripta con MYSQL_PASSWORD_DECRYPT_KEY (ej. AES-256-CBC en base64).
 * @param {string|null} stored - Valor de la columna password (texto plano o base64 según config).
 * @returns {string|null} Contraseña en claro o null si falla.
 */
function getPlainPassword(stored) {
  const s = stored != null ? String(stored).trim() : null;
  if (!s) return null;
  if (PASSWORD_PLAIN) return s.length >= 6 ? s : null;
  if (!DECRYPT_KEY) return null;
  try {
    const raw = Buffer.from(s, "base64");
    if (raw.length === 0) return null;
    let key = Buffer.from(DECRYPT_KEY, "utf8");
    if (key.length < 32) key = Buffer.concat([key, Buffer.alloc(32 - key.length, 0)]);
    else if (key.length > 32) key = key.subarray(0, 32);
    let iv;
    let ciphertext = raw;
    if (DECRYPT_IV_HEX) {
      iv = Buffer.from(DECRYPT_IV_HEX, "hex");
      if (iv.length < 16) iv = Buffer.concat([iv, Buffer.alloc(16 - iv.length, 0)]);
      else if (iv.length > 16) iv = iv.subarray(0, 16);
    } else if (raw.length >= 16) {
      iv = raw.subarray(0, 16);
      ciphertext = raw.subarray(16);
    } else {
      iv = Buffer.alloc(16, 0);
    }
    const decipher = crypto.createDecipheriv(DECRYPT_CIPHER, key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8").trim() || null;
  } catch {
    return null;
  }
}

function decryptPassword(encryptedBase64) {
  return getPlainPassword(encryptedBase64);
}

const runQuery = (sql) =>
  query(sql).catch((err) => {
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
  console.log("🔄 Migración usuarios: MySQL → MongoDB (rellenar mysqlId + crear faltantes)\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}\n`);

  let updated = 0;
  let created = 0;
  let skipped = 0;

  const mysqlUsers = await runQuery(
    "SELECT id, name, last_name, user_name, personal_email, identification, status, password FROM `user` ORDER BY id"
  );
  console.log(`📥 Usuarios en MySQL: ${mysqlUsers.length}`);
  if (!DECRYPT_KEY && !PASSWORD_PLAIN) {
    console.warn("⚠️  MYSQL_PASSWORD_DECRYPT_KEY no definida ni MYSQL_PASSWORD_PLAIN: se usará contraseña por defecto y debeCambiarPassword=true.\n");
  }

  const mongoUsers = await User.find({}).select("_id email code mysqlId").lean();
  const byEmail = new Map(mongoUsers.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
  const byCode = new Map(mongoUsers.filter((u) => u.code).map((u) => [String(u.code).trim(), u]));

  const hashedDefault = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  /** Dado un registro MySQL, obtiene contraseña hasheada para Mongo y si debe cambiar. */
  async function getPasswordFromRow(r) {
    const plain = decryptPassword(r.password != null ? String(r.password).trim() : null);
    if (plain && plain.length >= 6) {
      return { hashedPassword: await bcrypt.hash(plain, 10), debeCambiarPassword: false };
    }
    return { hashedPassword: hashedDefault, debeCambiarPassword: true };
  }

  for (const r of mysqlUsers) {
    const mysqlId = num(r.id);
    if (mysqlId == null) continue;

    const email = str(r.personal_email) || str(r.user_name);
    const code = str(r.identification) || str(r.user_name) || String(mysqlId);
    const name = [str(r.name), str(r.last_name)].filter(Boolean).join(" ").trim() || "Usuario";

    let mongoUser = byEmail.get((email || "").toLowerCase()) ?? (code ? byCode.get(code) : null);

    if (mongoUser) {
      if (mongoUser.mysqlId === mysqlId) {
        skipped++;
        continue;
      }
      const pwd = await getPasswordFromRow(r);
      await User.updateOne(
        { _id: mongoUser._id },
        { $set: { mysqlId, password: pwd.hashedPassword, debeCambiarPassword: pwd.debeCambiarPassword } }
      );
      updated++;
      byEmail.set((mongoUser.email || "").toLowerCase(), { ...mongoUser, mysqlId });
      if (mongoUser.code) byCode.set(mongoUser.code, { ...mongoUser, mysqlId });
    } else {
      const emailValid = email && EMAIL_REGEX.test(String(email).toLowerCase());
      const emailUnique = emailValid ? email.toLowerCase() : `user.${mysqlId}@migrated.co`;
      const codeUnique = `MIG-${mysqlId}`; // único por MySQL id para no colisionar con otros usuarios
      const existingByEmail = await User.findOne({ email: emailUnique.toLowerCase() }).lean();
      const existingByCode = await User.findOne({ code: codeUnique }).lean();
      if (existingByEmail) {
        const pwd = await getPasswordFromRow(r);
        await User.updateOne(
          { _id: existingByEmail._id },
          { $set: { mysqlId, password: pwd.hashedPassword, debeCambiarPassword: pwd.debeCambiarPassword } }
        );
        updated++;
        continue;
      }
      if (existingByCode && !existingByEmail) {
        const pwd = await getPasswordFromRow(r);
        await User.updateOne(
          { _id: existingByCode._id },
          { $set: { mysqlId, password: pwd.hashedPassword, debeCambiarPassword: pwd.debeCambiarPassword } }
        );
        updated++;
        continue;
      }
      const pwd = await getPasswordFromRow(r);
      const createdUser = await User.create({
        mysqlId,
        name: name || "Usuario",
        email: emailUnique.toLowerCase(),
        code: codeUnique,
        password: pwd.hashedPassword,
        estado: true,
        debeCambiarPassword: pwd.debeCambiarPassword,
      });
      created++;
      byEmail.set(createdUser.email.toLowerCase(), { _id: createdUser._id, email: createdUser.email, code: createdUser.code, mysqlId });
      byCode.set(createdUser.code, { _id: createdUser._id, email: createdUser.email, code: createdUser.code, mysqlId });
    }
  }

  console.log(`   ✅ Actualizados (mysqlId): ${updated}`);
  console.log(`   ✅ Creados (usuarios faltantes): ${created}`);
  console.log(`   ⏭️  Ya tenían mysqlId: ${skipped}`);
  console.log("\n💡 Vuelve a ejecutar: npm run migrate:postulants");

  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
