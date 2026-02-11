/**
 * RQ02_HU003: Integración con Universitas XXI (UXXI).
 * OSB - INFORMACIÓN ESTUDIANTES BPMN
 * - getInfoFacultades: facultades activas
 * - getInfoProgramas: programas/planes activos
 *
 * Variables de entorno:
 * - UXXI_GET_FACULTIES_URL: endpoint getInfoFacultades
 * - UXXI_GET_PROGRAMAS_URL: endpoint getInfoProgramas
 * - UXXI_TIMEOUT_MS: timeout en ms (opcional, default 15000)
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
