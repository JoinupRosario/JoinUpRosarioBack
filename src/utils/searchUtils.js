/**
 * Convierte un string de búsqueda en un regex que ignora acentos y mayúsculas.
 * Ejemplo: "gestion" matchea "gestión", "Gestión", "GESTIÓN", etc.
 */
const ACCENT_MAP = {
  a: "[aáàäâã]",
  á: "[aáàäâã]",
  à: "[aáàäâã]",
  ä: "[aáàäâã]",
  â: "[aáàäâã]",
  ã: "[aáàäâã]",
  e: "[eéèëê]",
  é: "[eéèëê]",
  è: "[eéèëê]",
  ë: "[eéèëê]",
  ê: "[eéèëê]",
  i: "[iíìïî]",
  í: "[iíìïî]",
  ì: "[iíìïî]",
  ï: "[iíìïî]",
  î: "[iíìïî]",
  o: "[oóòöôõ]",
  ó: "[oóòöôõ]",
  ò: "[oóòöôõ]",
  ö: "[oóòöôõ]",
  ô: "[oóòöôõ]",
  õ: "[oóòöôõ]",
  u: "[uúùüû]",
  ú: "[uúùüû]",
  ù: "[uúùüû]",
  ü: "[uúùüû]",
  û: "[uúùüû]",
  n: "[nñ]",
  ñ: "[nñ]",
};

/**
 * @param {string} str - Término de búsqueda del usuario
 * @returns {object} - Objeto compatible con $regex de Mongoose: { $regex, $options }
 */
export function buildSearchRegex(str) {
  const pattern = str
    .toLowerCase()
    .split("")
    .map((c) => ACCENT_MAP[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("");
  return { $regex: pattern, $options: "i" };
}

/** Escapa caracteres especiales para usar el texto del usuario dentro de $regex literal (sin mapa de acentos). */
export function escapeRegex(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
