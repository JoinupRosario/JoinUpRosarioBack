/**
 * RQ02_HU003: Integración con Universitas XXI (UXXI) / OSB.
 * getInfoFacultades y getInfoProgramas ya configurados (UXXI_GET_FACULTIES_URL, UXXI_GET_PROGRAMAS_URL).
 *
 * Info académica / consulta estudiante:
 * - consultaInfEstudiante → URL_OSB (del .env) + path /uxxi-URO/Proxy/Consulta_inf_estudiante en código.
 * - Opcional: OSB_USER y OSB_PASSWORD en .env para Basic Auth (el .env no se sube a git, es seguro).
 *
 * UXXI_TIMEOUT_MS: timeout en ms (opcional, default 15000).
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

/**
 * Consulta información básica del estudiante en Universitas (OSB).
 * URL = URL_OSB + /uxxi-URO/Proxy/Consulta_inf_estudiante (path en código).
 * POST body: { documento }. Opcional: Basic Auth con OSB_USER y OSB_PASSWORD.
 */
export const consultaInfEstudiante = async (documento) => {
  const baseUrl = (process.env.URL_OSB || "").trim().replace(/\/$/, "");
  const userName = (process.env.OSB_USER || "").trim();
  const password = process.env.OSB_PASSWORD;
  if (!baseUrl || !documento) return null;

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (userName && password !== undefined && password !== "") {
    headers.Authorization = "Basic " + Buffer.from(`${userName}:${password}`).toString("base64");
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
 * POST body: { documento }. Devuelve el array de ítems (programas) de items[0].resultSet.items.
 */
export const consultaInfAcademica = async (documento) => {
  const baseUrl = (process.env.URL_OSB || "").trim().replace(/\/$/, "");
  const userName = (process.env.OSB_USER || "").trim();
  const password = process.env.OSB_PASSWORD;
  const docStr = documento != null ? String(documento).trim() : "";
  if (!baseUrl) {
    const err = new Error("URL_OSB no está configurado en el servidor. No se puede llamar a Consulta_inf_academica.");
    err.code = "CONFIG_MISSING";
    throw err;
  }
  if (!docStr) return null;

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (userName && password !== undefined && password !== "") {
    headers.Authorization = "Basic " + Buffer.from(`${userName}:${password}`).toString("base64");
  }

  const url = baseUrl + "/uxxi-URO/Proxy/Consulta_inf_academica";
  const body = JSON.stringify({ documento: docStr });

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

    // Estructura esperada: { items: [ { resultSet: { items: [...] } } ] }
    const statements = data.items;
    if (Array.isArray(statements) && statements.length > 0) {
      const first = statements[0];
      const resultSet = first?.resultSet;
      if (resultSet && Array.isArray(resultSet.items)) return resultSet.items;
    }
    // Alternativa: resultSet en la raíz
    if (data.resultSet && Array.isArray(data.resultSet.items)) return data.resultSet.items;
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
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
