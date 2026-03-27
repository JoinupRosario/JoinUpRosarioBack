import mongoose from "mongoose";
import UserAdministrativo from "../../usersAdministrativos/userAdministrativo.model.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Clave de destinatario que es un ObjectId de Rol (24 hex). */
const MONGO_OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function isValidEmail(s) {
  return typeof s === "string" && EMAIL_RE.test(s.trim());
}

/**
 * Normaliza a lista única de correos válidos.
 * @param {string|string[]|undefined|null} value
 * @returns {string[]}
 */
export function normalizeEmailList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  const out = new Set();
  for (const v of arr) {
    if (v == null) continue;
    const e = String(v).trim();
    if (isValidEmail(e)) out.add(e.toLowerCase());
  }
  return [...out];
}

/**
 * Lista de correos desde variable de entorno (separados por coma).
 * @param {string|undefined} envValue
 */
export function parseEnvEmailList(envValue) {
  if (!envValue || typeof envValue !== "string") return [];
  return normalizeEmailList(envValue.split(","));
}

function normalizeRoleIdList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  const out = new Set();
  for (const v of arr) {
    if (v == null) continue;
    const id = String(v).trim().toLowerCase();
    if (MONGO_OBJECT_ID_RE.test(id) && mongoose.Types.ObjectId.isValid(id)) out.add(id);
  }
  return [...out];
}

/**
 * A partir de las keys de destinatarios de la plantilla y un contexto (misma key → email(s)),
 * devuelve correos únicos a los que enviar.
 * @param {string[]} destinatarioKeys - ej. ['coordinador','docente']
 * @param {Record<string, string|string[]|undefined>} context
 * @returns {string[]}
 */
export function resolveEmailsFromDestinatarioKeys(destinatarioKeys, context = {}) {
  const keys = Array.isArray(destinatarioKeys) ? destinatarioKeys : [];
  const out = new Set();
  for (const key of keys) {
    const k = String(key).toLowerCase().trim();
    if (!k) continue;
    const raw = context[k];
    normalizeEmailList(raw).forEach((e) => out.add(e));
  }
  return [...out];
}

/**
 * Correos de usuarios administrativos activos que tienen el rol indicado (por _id).
 * @param {string} roleIdStr
 * @returns {Promise<string[]>}
 */
async function emailsForUsersWithRoleId(roleIdStr) {
  const id = String(roleIdStr).trim();
  if (!MONGO_OBJECT_ID_RE.test(id) || !mongoose.Types.ObjectId.isValid(id)) return [];
  const oid = new mongoose.Types.ObjectId(id);
  const profiles = await UserAdministrativo.find({
    estado: true,
    roles: { $elemMatch: { rol: oid, estado: true } },
  })
    .populate({ path: "user", select: "email estado" })
    .lean();

  const out = new Set();
  for (const p of profiles) {
    const u = p.user;
    if (!u || u.estado === false) continue;
    const e = u.email;
    if (typeof e === "string" && isValidEmail(e)) out.add(e.trim().toLowerCase());
  }
  return [...out];
}

/**
 * Igual que `resolveEmailsFromDestinatarioKeys`, pero si la clave es un ObjectId de rol,
 * agrega los correos de todos los administrativos con ese rol.
 * Mantiene compatibilidad con claves de catálogo (coordinador, docente, …).
 *
 * @param {string[]} destinatarioKeys
 * @param {Record<string, string|string[]|undefined>} context
 * @returns {Promise<string[]>}
 */
export async function resolveEmailsFromDestinatarioKeysAsync(destinatarioKeys, context = {}) {
  const keys = Array.isArray(destinatarioKeys) ? destinatarioKeys : [];
  const out = new Set();
  const roleCache = new Map();

  for (const key of keys) {
    const k = String(key).toLowerCase().trim();
    if (!k) continue;
    const rawContextValue = context[k];
    normalizeEmailList(rawContextValue).forEach((e) => out.add(e));

    // También acepta que el contexto pase IDs de rol (uno o varios) para esa key.
    for (const roleId of normalizeRoleIdList(rawContextValue)) {
      let roleEmails = roleCache.get(roleId);
      if (roleEmails === undefined) {
        roleEmails = await emailsForUsersWithRoleId(roleId);
        roleCache.set(roleId, roleEmails);
      }
      roleEmails.forEach((e) => out.add(e));
    }

    if (MONGO_OBJECT_ID_RE.test(k)) {
      let roleEmails = roleCache.get(k);
      if (roleEmails === undefined) {
        roleEmails = await emailsForUsersWithRoleId(k);
        roleCache.set(k, roleEmails);
      }
      roleEmails.forEach((e) => out.add(e));
    }
  }
  return [...out];
}
