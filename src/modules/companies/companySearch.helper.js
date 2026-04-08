/**
 * Búsqueda de empresas: insensible a mayúsculas y tildes (español) en nombres,
 * y coincidencias por NIT / idNumber (incluye guiones o puntos en BD).
 */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mapa base (sin tilde) → clase de caracteres en regex (Mongo). */
const ACCENT_CHAR_CLASS = {
  a: "aáàâäãAÁÀÂÄÃ",
  e: "eéèêëEÉÈÊË",
  i: "iíìîïIÍÌÎÏ",
  o: "oóòôöõOÓÒÔÖÕ",
  u: "uúùûüUÚÙÛÜ",
  n: "nñNÑ",
  c: "cçCÇ",
};

/**
 * Patrón regex para que "confederacion" encuentre "Confederación".
 * @param {string} searchTerm
 * @returns {string|null}
 */
export function buildAccentInsensitiveMongoRegexPattern(searchTerm) {
  const s = String(searchTerm || "").trim();
  if (!s) return null;
  let pattern = "";
  for (const ch of s) {
    const base = ch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (base.length === 1 && ACCENT_CHAR_CLASS[base]) {
      pattern += `[${ACCENT_CHAR_CLASS[base]}]`;
    } else if (/[.*+?^${}()|[\]\\]/.test(ch)) {
      pattern += `\\${ch}`;
    } else {
      pattern += escapeRegex(ch);
    }
  }
  return pattern;
}

/**
 * Dígitos con separadores opcionales (ej. 8600256140 vs 860025614-0).
 * @param {string} digitsOnly — solo dígitos, length >= 3
 */
function buildFlexibleDigitPattern(digitsOnly) {
  const d = String(digitsOnly || "").replace(/\D/g, "");
  if (d.length < 3) return null;
  return d
    .split("")
    .map((c) => escapeRegex(c))
    .join("[-.\\s]*");
}

/**
 * Filtro Mongo para el parámetro `search` de GET /companies.
 * @param {string} search
 * @returns {object|null} — { $or: [...] } o null
 */
export function buildCompanySearchFilter(search) {
  const s = String(search || "").trim();
  if (!s) return null;

  const namePattern = buildAccentInsensitiveMongoRegexPattern(s);
  if (!namePattern) return null;

  const escaped = escapeRegex(s);
  const digitsOnly = s.replace(/\D/g, "");

  const or = [
    { name: { $regex: namePattern, $options: "i" } },
    { legalName: { $regex: namePattern, $options: "i" } },
    { commercialName: { $regex: namePattern, $options: "i" } },
    { nit: { $regex: escaped, $options: "i" } },
    { idNumber: { $regex: escaped, $options: "i" } },
    { email: { $regex: escaped, $options: "i" } },
    { "contact.email": { $regex: escaped, $options: "i" } },
    { "legalRepresentative.email": { $regex: escaped, $options: "i" } },
  ];

  if (digitsOnly.length >= 3) {
    const flex = buildFlexibleDigitPattern(digitsOnly);
    if (flex) {
      or.push({ nit: { $regex: flex, $options: "i" } });
      or.push({ idNumber: { $regex: flex, $options: "i" } });
    }
  }

  return { $or: or };
}
