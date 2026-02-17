/**
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

/**
 * Obtiene facultades desde OSB Proxy Consulta_facultades (Basic auth).
 * Respuesta esperada: { items: [ { resultSet: { items: [ { cod_facultad, nombre_facultad } ] } } ] }
 * @returns {Promise<{ cod_facultad: number, nombre_facultad: string }[]>}
 */
export const getFacultadesFromOSB = async () => {
  const baseUrl = process.env.URL_OSB;
  const username = process.env.USS_URJOB;
  const password = process.env.PASS_URJOB;
  if (!baseUrl) throw new Error("URL_OSB no configurada en .env");
  const url = `${baseUrl.replace(/\/$/, "")}/uxxi-URO/Proxy/Consulta_facultades`;
  const credentials = username && password ? Buffer.from(`${username}:${password}`).toString("base64") : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeout());
  const headers = { Accept: "application/json" };
  if (credentials) headers.Authorization = `Basic ${credentials}`;
  const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  clearTimeout(timeout);
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
  const username = process.env.USS_URJOB;
  const password = process.env.PASS_URJOB;
  if (!baseUrl) throw new Error("URL_OSB no configurada en .env");
  const url = `${baseUrl.replace(/\/$/, "")}/uxxi-URO/Proxy/Consulta_programas`;
  const credentials = username && password ? Buffer.from(`${username}:${password}`).toString("base64") : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeout());
  const headers = { Accept: "application/json" };
  if (credentials) headers.Authorization = `Basic ${credentials}`;
  const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  clearTimeout(timeout);
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
