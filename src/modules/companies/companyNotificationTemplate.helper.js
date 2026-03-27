/**
 * Variables de plantilla para notificaciones de entidad (registro, credenciales, etc.).
 * Prioriza dirección/teléfono de la empresa; si faltan, usa contacto principal y el resto de contactos.
 */

function companyPlain(company) {
  if (!company) return {};
  if (typeof company.toObject === "function") return company.toObject();
  return { ...company };
}

export function labelTipoIdentificacionEntidad(idType) {
  const t = String(idType || "NIT").trim().toUpperCase();
  const map = {
    NIT: "NIT (Número de Identificación Tributaria)",
    CC: "Cédula de ciudadanía",
    CE: "Cédula de extranjería",
    TI: "Tarjeta de identidad",
    PAS: "Pasaporte",
    RUT: "RUT",
  };
  return map[t] || (idType ? String(idType).trim() : "NIT");
}

function firstNonEmptyContactField(contacts, extractor) {
  if (!Array.isArray(contacts)) return "";
  for (const ct of contacts) {
    if (!ct) continue;
    const raw = extractor(ct);
    const s = String(raw ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * @param {object} company - Documento Company o plain object
 * @param {{ userEmail?: string, link: string, password?: string }} opts
 */
export function buildDatosPlantillaEntidad(company, { userEmail, link, password }) {
  const c = companyPlain(company);
  const contactoPrincipal = Array.isArray(c.contacts)
    ? c.contacts.find((x) => x && (x.isPrincipal === true || x.isPrincipal === "true"))
    : null;

  const direccionRaw =
    String(c.address || "").trim() ||
    String(c.direccion || "").trim() ||
    String(c.contact?.address || "").trim() ||
    String(contactoPrincipal?.address || "").trim() ||
    firstNonEmptyContactField(c.contacts, (ct) => ct?.address) ||
    String((Array.isArray(c.branches) ? c.branches[0]?.address : "") || "").trim();

  const telefonoRaw =
    String(c.phone || "").trim() ||
    String(c.contact?.phone || "").trim() ||
    String(contactoPrincipal?.phone || "").trim() ||
    String(contactoPrincipal?.mobile || "").trim() ||
    firstNonEmptyContactField(c.contacts, (ct) => ct?.phone || ct?.mobile) ||
    String(c.contact?.mobile || c.mobile || "").trim();

  const nombreEntidad = c.commercialName || c.name || c.legalName || "";
  const usuario = userEmail || c.contact?.email || c.email || "";
  const nit = String(c.nit || c.idNumber || "").trim();
  const ciudad = String(c.city || c.ciudad || "").trim();
  const pais = String(c.country || c.pais || "").trim();

  return {
    NOMBRE_ENTIDAD: nombreEntidad,
    USUARIO: usuario,
    LINK: link,
    TIPO_IDENTIFICACION: labelTipoIdentificacionEntidad(c.idType),
    NUMERO_IDENTIFICACION: nit,
    DIRECCION: direccionRaw || "Sin dirección registrada",
    TELEFONO: telefonoRaw || "Sin teléfono registrado",
    CIUDAD: ciudad,
    PAIS: pais,
    CONTRASENA_TEMPORAL: password != null && password !== "" ? String(password) : "",
  };
}
