/**
 * Utilidades para plantillas de notificación:
 * - Extraer variables [KEY] de un texto
 * - Validar que las variables usadas existan en el catálogo
 * - Renderizar texto reemplazando [KEY] o {{KEY}} con datos reales
 */

/** Acepta [KEY] y [key] (mayúsculas/minúsculas) para plantillas editadas en rich text. */
const VARIABLE_REGEX = /\[([A-Za-z0-9_]+)\]/gi;
const VARIABLE_REGEX_DOUBLE = /\{\{([A-Za-z0-9_]+)\}\}/gi;

/**
 * Claves antiguas → clave canónica en catálogo (misma semántica).
 * Permite validar y renderizar plantillas que aún usan [IDENTIFICACION_ESTUDIANTE], etc.
 */
const VARIABLE_KEY_ALIASES = {
  IDENTIFICACION_ESTUDIANTE: "NUMERO_IDENTIFICACION",
  NUMERO_DOCUMENTO_ESTUDIANTE: "NUMERO_IDENTIFICACION",
  NUMERO_IDENTIFICACION_ENTIDAD: "NUMERO_IDENTIFICACION",
  TIPO_DOCUMENTO_ESTUDIANTE: "TIPO_IDENTIFICACION",
  NIT_ENTIDAD: "NUMERO_IDENTIFICACION",
  NUMERO_NIT: "NUMERO_IDENTIFICACION",
  DOCUMENTO_ENTIDAD: "NUMERO_IDENTIFICACION",
  DOMICILIO: "DIRECCION",
  DIRECCION_ENTIDAD: "DIRECCION",
};

function canonicalNotificationKey(key) {
  const u = String(key).toUpperCase();
  return VARIABLE_KEY_ALIASES[u] || u;
}

function pickDatumRaw(d, k) {
  if (k == null) return undefined;
  const ku = String(k).trim();
  if (Object.prototype.hasOwnProperty.call(d, ku)) return d[ku];
  const upper = ku.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(d, upper)) return d[upper];
  const found = Object.keys(d).find((k0) => String(k0).trim().toUpperCase() === upper);
  if (found != null) return d[found];
  return undefined;
}

function resolveDatumForKey(key, datos) {
  const upper = String(key).trim().toUpperCase();
  const d = datos && typeof datos === "object" ? datos : {};
  const pick = (k) => {
    const v = pickDatumRaw(d, k);
    return v != null && String(v).trim() !== "" ? String(v) : null;
  };
  let v = pick(upper);
  if (v != null) return v;
  const canon = VARIABLE_KEY_ALIASES[upper];
  if (canon) {
    v = pick(canon);
    if (v != null) return v;
  }
  for (const [alias, c] of Object.entries(VARIABLE_KEY_ALIASES)) {
    if (c === upper) {
      v = pick(alias);
      if (v != null) return v;
    }
  }
  return "";
}

/** Rich text / HTML suele guardar `&#91;` / `&#93;` en lugar de `[` `]`; sin esto no matchea el regex y no se reemplaza. */
function normalizePlaceholderDelimiters(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/&#91;/gi, "[")
    .replace(/&#93;/gi, "]")
    .replace(/\uFF3B/g, "[")
    .replace(/\uFF3D/g, "]");
}

/**
 * Extrae los nombres de variables (sin corchetes) de un texto.
 * Acepta formato [KEY] y opcionalmente {{KEY}}.
 * @param {string} text - Texto que puede contener [VARIABLE] o {{VARIABLE}}
 * @returns {string[]} Array de keys únicos en mayúsculas
 */
export function extractVariablesFromText(text) {
  if (!text || typeof text !== "string") return [];
  const keys = new Set();
  let match;
  const re = new RegExp(VARIABLE_REGEX.source, "gi");
  while ((match = re.exec(text)) !== null) {
    keys.add(String(match[1] || "").trim().toUpperCase());
  }
  const re2 = new RegExp(VARIABLE_REGEX_DOUBLE.source, "gi");
  while ((match = re2.exec(text)) !== null) {
    keys.add(String(match[1] || "").trim().toUpperCase());
  }
  return Array.from(keys);
}

/**
 * Valida que todas las variables usadas en asunto y cuerpo existan en el catálogo.
 * @param {string} asunto
 * @param {string} cuerpo
 * @param {string[]} validKeys - Keys válidos (ej: del catálogo NotificationVariable)
 * @returns {{ valid: boolean, invalidVariables: string[] }}
 */
export function validatePlantillaVariables(asunto, cuerpo, validKeys) {
  const used = [
    ...extractVariablesFromText(asunto || ""),
    ...extractVariablesFromText(cuerpo || ""),
  ];
  const validSet = new Set((validKeys || []).map((k) => String(k).toUpperCase()));
  const invalidVariables = used.filter((k) => !validSet.has(k));
  return {
    valid: invalidVariables.length === 0,
    invalidVariables: [...new Set(invalidVariables)],
  };
}

/**
 * Reemplaza variables [KEY] y {{KEY}} en un texto con valores del objeto datos.
 * @param {string} text - Texto con [KEY] o {{KEY}}
 * @param {Record<string, string|number|null|undefined>} datos - Mapa key → valor
 * @returns {string} Texto con variables reemplazadas (las no encontradas se dejan vacías)
 */
export function renderPlantillaContent(text, datos = {}) {
  if (!text || typeof text !== "string") return "";
  let result = normalizePlaceholderDelimiters(text);
  const keys = extractVariablesFromText(result);
  for (const key of keys) {
    const value = resolveDatumForKey(key, datos);
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\[${escaped}\\]`, "gi"), value);
    result = result.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, "gi"), value);
  }
  // Fallback: claves presentes en `datos` pero no detectadas (p. ej. otro formato intermedio)
  const d = datos && typeof datos === "object" ? datos : {};
  for (const k of Object.keys(d)) {
    const ku = String(k).trim().toUpperCase();
    if (!/^[A-Z0-9_]+$/.test(ku)) continue;
    const val = resolveDatumForKey(ku, datos);
    const escaped = ku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\[${escaped}\\]`, "gi"), val);
    result = result.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, "gi"), val);
  }
  return result;
}

/**
 * Dado un asunto y cuerpo de plantilla y un objeto de datos, devuelve
 * { asunto: string, cuerpo: string } con las variables reemplazadas.
 * @param {string} asunto
 * @param {string} cuerpo
 * @param {Record<string, string|number|null|undefined>} datos
 * @returns {{ asunto: string, cuerpo: string }}
 */
export function renderPlantilla(asunto, cuerpo, datos = {}) {
  return {
    asunto: renderPlantillaContent(asunto || "", datos),
    cuerpo: renderPlantillaContent(cuerpo || "", datos),
  };
}
