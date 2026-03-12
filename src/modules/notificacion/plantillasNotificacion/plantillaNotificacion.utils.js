/**
 * Utilidades para plantillas de notificación:
 * - Extraer variables [KEY] de un texto
 * - Validar que las variables usadas existan en el catálogo
 * - Renderizar texto reemplazando [KEY] o {{KEY}} con datos reales
 */

const VARIABLE_REGEX = /\[([A-Z0-9_]+)\]/gi;
const VARIABLE_REGEX_DOUBLE = /\{\{([A-Z0-9_]+)\}\}/gi;

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
    keys.add(String(match[1]).toUpperCase());
  }
  const re2 = new RegExp(VARIABLE_REGEX_DOUBLE.source, "gi");
  while ((match = re2.exec(text)) !== null) {
    keys.add(String(match[1]).toUpperCase());
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
  let result = text;
  const keys = extractVariablesFromText(text);
  for (const key of keys) {
    const value = datos[key] != null ? String(datos[key]) : "";
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\[${escaped}\\]`, "gi"), value);
    result = result.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, "gi"), value);
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
