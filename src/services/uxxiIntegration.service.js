/**
 * RQ02_HU003: Integración con Universitas XXI (UXXI) / OSB.
 * getInfoFacultades y getInfoProgramas ya configurados (UXXI_GET_FACULTIES_URL, UXXI_GET_PROGRAMAS_URL).
 *
 * Info académica / consulta estudiante:
 * - consultaInfEstudiante → URL_OSB (del .env) + path /uxxi-URO/Proxy/Consulta_inf_estudiante en código.
 * - Opcional: OSB_USER y OSB_PASSWORD en .env para Basic Auth (el .env no se sube a git, es seguro).
 *
 * UXXI_TIMEOUT_MS: timeout en ms (opcional, default 15000).
 * RQ02_HU003: Integración con Universitas XXI (UXXI).
 * OSB - INFORMACIÓN ESTUDIANTES BPMN
 * - getInfoFacultades: facultades activas
 * - getInfoProgramas: programas/planes activos
 * - getFacultadesFromOSB: Consulta_facultades (OSB Proxy) con Basic auth
 *
 * Variables de entorno:
 * - UXXI_GET_FACULTIES_URL: endpoint getInfoFacultades
 * - UXXI_GET_PROGRAMAS_URL: endpoint getInfoProgramas
 * - UXXI_TIMEOUT_MS: timeout en ms (opcional, default 15000)
 * - URL_OSB: base URL del OSB (ej. https://osb.example.com)
 * - USS_URJOB: usuario para Basic auth (Consulta_facultades)
 * - PASS_URJOB: contraseña para Basic auth (Consulta_facultades)
 */

const getTimeout = () => parseInt(process.env.UXXI_TIMEOUT_MS, 10) || 15000;

/**
 * Obtiene facultades desde UXXI (getInfoFacultades).
 * @returns {Promise<{ code: string, name: string, status?: string }[] | null>} null si no configurado o error
 */
export const getInfoFacultades = async () => {
  const url = process.env.UXXI_GET_FACULTIES_URL;
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeout());
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`UXXI facultades: ${res.status}`);
    const data = await res.json();
    // Esperado: array de { code, name, status } o { codigo, nombre, estado }
    const list = Array.isArray(data) ? data : data?.facultades ?? data?.data ?? [];
    return list.map((f) => ({
      code: f.code ?? f.codigo ?? "",
      name: (f.name ?? f.nombre ?? "").substring(0, 255),
      status: f.status ?? f.estado ?? "ACTIVE",
    }));
  } catch (err) {
    console.error("UXXI getInfoFacultades:", err.message);
    throw err;
  }
};

/**
 * Obtiene programas/planes desde UXXI (getInfoProgramas).
 * @returns {Promise<{ codigoFacultad: string, codigoPrograma: string, nombreFacultad: string, nombrePrograma: string, estado?: string }[] | null>} null si no configurado o error
 */
export const getInfoProgramas = async () => {
  const url = process.env.UXXI_GET_PROGRAMAS_URL;
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeout());
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`UXXI programas: ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.programas ?? data?.planes ?? data?.data ?? [];
    return list.map((p) => ({
      codigoFacultad: p.codigoFacultad ?? p.facultyCode ?? "",
      codigoPrograma: p.codigoPrograma ?? p.programCode ?? "",
      nombreFacultad: (p.nombreFacultad ?? p.facultyName ?? "").substring(0, 255),
      nombrePrograma: (p.nombrePrograma ?? p.programName ?? "").substring(0, 255),
      estado: p.estado ?? p.status ?? "ACTIVE",
    }));
  } catch (err) {
    console.error("UXXI getInfoProgramas:", err.message);
    throw err;
  }
};

/** Credenciales OSB: USS_URJOB/PASS_URJOB o, si no están, OSB_USER/OSB_PASSWORD. */
function getOSBCredentials() {
  const user = (process.env.USS_URJOB ?? process.env.OSB_USER ?? "").trim();
  const pass = process.env.PASS_URJOB ?? process.env.OSB_PASSWORD;
  return user && pass !== undefined && pass !== "" ? { user, pass } : null;
}

/**
 * Obtiene facultades desde OSB Proxy Consulta_facultades (Basic auth).
 * Respuesta esperada: { items: [ { resultSet: { items: [ { cod_facultad, nombre_facultad } ] } } ] }
 * @returns {Promise<{ cod_facultad: number, nombre_facultad: string }[]>}
 */
export const getFacultadesFromOSB = async () => {
  const baseUrl = process.env.URL_OSB;
  const creds = getOSBCredentials();
  if (!baseUrl) throw new Error("URL_OSB no configurada en .env");
  if (!creds) throw new Error("Credenciales OSB no configuradas. Definir USS_URJOB y PASS_URJOB (o OSB_USER y OSB_PASSWORD) en .env");
  const url = `${baseUrl.replace(/\/$/, "")}/uxxi-URO/Proxy/Consulta_facultades`;
  const credentials = Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeout());
  const headers = { Accept: "application/json", Authorization: `Basic ${credentials}` };
  const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  clearTimeout(timeout);
  if (res.status === 401) throw new Error("OSB Consulta_facultades: 401 — Usuario o contraseña incorrectos (revisar USS_URJOB/PASS_URJOB o OSB_USER/OSB_PASSWORD).");
  if (!res.ok) throw new Error(`OSB Consulta_facultades: ${res.status}`);
  const data = await res.json();
  const firstItem = data?.items?.[0];
  const resultSet = firstItem?.resultSet;
  const items = resultSet?.items ?? [];
  return items.map((f) => ({
    cod_facultad: f.cod_facultad,
    nombre_facultad: (f.nombre_facultad ?? "").toString().substring(0, 255),
  }));
};

/**
 * Obtiene programas desde OSB Proxy Consulta_programas (Basic auth).
 * Respuesta: { items: [ { resultSet: { items: [ { planestudio, nombre_programa, cod_facultad, nombre_facultad, tipo_estudio, activo } ] } } ] }
 */
export const getProgramasFromOSB = async () => {
  const baseUrl = process.env.URL_OSB;
  const creds = getOSBCredentials();
  if (!baseUrl) throw new Error("URL_OSB no configurada en .env");
  if (!creds) throw new Error("Credenciales OSB no configuradas. Definir USS_URJOB y PASS_URJOB (o OSB_USER y OSB_PASSWORD) en .env");
  const url = `${baseUrl.replace(/\/$/, "")}/uxxi-URO/Proxy/Consulta_programas`;
  const credentials = Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeout());
  const headers = { Accept: "application/json", Authorization: `Basic ${credentials}` };
  const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  clearTimeout(timeout);
  if (res.status === 401) throw new Error("OSB Consulta_programas: 401 — Usuario o contraseña incorrectos (revisar USS_URJOB/PASS_URJOB o OSB_USER/OSB_PASSWORD).");
  if (!res.ok) throw new Error(`OSB Consulta_programas: ${res.status}`);
  const data = await res.json();
  const firstItem = data?.items?.[0];
  const resultSet = firstItem?.resultSet;
  const items = resultSet?.items ?? [];
  return items.map((p) => ({
    planestudio: (p.planestudio ?? "").toString().trim(),
    nombre_programa: (p.nombre_programa ?? "").toString().substring(0, 255),
    cod_facultad: p.cod_facultad,
    nombre_facultad: (p.nombre_facultad ?? "").toString().substring(0, 255),
    tipo_estudio: (p.tipo_estudio ?? "").toString().trim(),
    activo: (p.activo ?? "S").toString().toUpperCase() === "S" ? "SI" : "NO",
  }));
};

/**
 * Consulta información básica del estudiante en Universitas (OSB).
 * URL = URL_OSB + /uxxi-URO/Proxy/Consulta_inf_estudiante (path en código).
 * POST body: { documento }. Basic Auth con USS_URJOB y PASS_URJOB (o OSB_USER/OSB_PASSWORD).
 */
export const consultaInfEstudiante = async (documento) => {
  const baseUrl = (process.env.URL_OSB || "").trim().replace(/\/$/, "");
  const creds = getOSBCredentials();
  if (!baseUrl || !documento) return null;

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (creds) {
    headers.Authorization = "Basic " + Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeout());
    const res = await fetch(baseUrl + "/uxxi-URO/Proxy/Consulta_inf_estudiante", {
      method: "POST",
      headers,
      body: JSON.stringify({ documento: String(documento).trim() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Consulta inf estudiante: ${res.status}`);
    const data = await res.json();
    const items = data?.items;
    const firstResult = Array.isArray(items) && items[0]?.resultSet?.items?.length ? items[0].resultSet.items[0] : null;
    return firstResult || null;
  } catch (err) {
    console.error("UXXI consultaInfEstudiante:", err.message);
    throw err;
  }
};

/**
 * Consulta información académica del estudiante en Universitas (OSB).
 * URL = URL_OSB + /uxxi-URO/Proxy/Consulta_inf_academica
 * POST body: { documento }. Basic Auth con USS_URJOB y PASS_URJOB (o OSB_USER/OSB_PASSWORD).
 */
export const consultaInfAcademica = async (documento) => {
  const baseUrl = (process.env.URL_OSB || "").trim().replace(/\/$/, "");
  const creds = getOSBCredentials();
  const docStr = documento != null ? String(documento).trim() : "";
  if (!baseUrl) {
    const err = new Error("URL_OSB no está configurado en el servidor. No se puede llamar a Consulta_inf_academica.");
    err.code = "CONFIG_MISSING";
    throw err;
  }
  if (!docStr) return null;

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (creds) {
    headers.Authorization = "Basic " + Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  }

  const url = baseUrl + "/uxxi-URO/Proxy/Consulta_inf_academica";
  const body = JSON.stringify({ documento: docStr });

  console.log(`[OSB Acad] POST ${url} — doc=${docStr}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeout());
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    console.log(`[OSB Acad] doc=${docStr} → HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!res.ok) {
      let msg = "";
      if (text) {
        const parsed = contentType.includes("json") ? tryParseJson(text) : text;
        msg = typeof parsed === "object" ? JSON.stringify(parsed).slice(0, 300) : String(parsed).slice(0, 300);
      }
      throw new Error(`Universitas (Consulta_inf_academica): ${res.status}${msg ? ` — ${msg}` : ""}`);
    }

    const data = text ? tryParseJson(text) : null;
    if (!data) throw new Error("Universitas devolvió respuesta vacía o no JSON.");

    // Ficha técnica: { env?: {}, items: [ { resultSet: { items: [...] } } ] }
    const statements = data.items;
    if (Array.isArray(statements) && statements.length > 0) {
      const first = statements[0];
      const resultSet = first?.resultSet;
      const items = resultSet?.items;
      if (Array.isArray(items) && items.length > 0) {
        console.log(`[OSB Acad] doc=${docStr} → ${items.length} planes`);
        return items;
      }
    }
    // Alternativa: resultSet en la raíz
    if (data.resultSet && Array.isArray(data.resultSet.items)) {
      console.log(`[OSB Acad] doc=${docStr} → ${data.resultSet.items.length} planes (raíz)`);
      return data.resultSet.items;
    }
    console.warn(`[OSB Acad] doc=${docStr} → sin planes en la respuesta. Keys: ${Object.keys(data).join(', ')}`);
    return [];
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("Timeout al conectar con Universitas (Consulta_inf_academica).");
      e.code = "TIMEOUT";
      throw e;
    }
    console.error("UXXI consultaInfAcademica:", err.message);
    throw err;
  }
};

function tryParseJson(str) {
  if (str == null || typeof str !== "string") return str == null ? null : str;
  const trimmed = str.trim();
  if (trimmed === "" || trimmed === "null") return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
