import { Client } from "ssh2";
import * as XLSX from "xlsx";

// ── Caché por mtime: sólo re-descarga si el archivo cambió en el SFTP ──────
let _cachedBuffer = null;
let _cachedMtime  = null; // número (Unix timestamp en segundos)

/** Retorna el buffer en caché si el mtime remoto coincide con el cacheado, o null si hay que re-descargar. */
function getCachedIfFresh(remoteMtime) {
  if (_cachedBuffer && _cachedMtime != null && remoteMtime === _cachedMtime) {
    console.log(`[SFTP-Postulantes] Archivo sin cambios (mtime ${remoteMtime}) — usando caché en memoria`);
    return _cachedBuffer;
  }
  return null;
}

function setCache(buf, mtime) {
  _cachedBuffer = buf;
  _cachedMtime  = mtime;
}

// ── Caché separada para CARGUE_EGRESADOSUR ─────────────────────────────────
let _cachedBufferEgresados = null;
let _cachedMtimeEgresados = null;

function getCachedEgresadosIfFresh(remoteMtime) {
  if (_cachedBufferEgresados && _cachedMtimeEgresados != null && remoteMtime === _cachedMtimeEgresados) {
    console.log(`[SFTP-Egresados] Archivo sin cambios (mtime ${remoteMtime}) — usando caché`);
    return _cachedBufferEgresados;
  }
  return null;
}

function setCacheEgresados(buf, mtime) {
  _cachedBufferEgresados = buf;
  _cachedMtimeEgresados = mtime;
}

function getConfig() {
  return {
    host:     process.env.SFTP_HOST     || "35.208.21.19",
    user:     process.env.SFTP_USER     || "urosariosftp",
    password: process.env.SFTP_PASSWORD || "",
    path:     process.env.SFTP_POSTULANTES_PATH || "/upload/process/cargue_postulantes.xlsx",
  };
}

/** Misma carpeta que cargue_postulantes: CARGUE_EGRESADOSUR.xlsx */
function getEgresadosConfig() {
  return {
    host:     process.env.SFTP_HOST     || "35.208.21.19",
    user:     process.env.SFTP_USER     || "urosariosftp",
    password: process.env.SFTP_PASSWORD || "",
    path:     process.env.SFTP_EGRESADOS_PATH || "/upload/process/CARGUE_EGRESADOSUR.xlsx",
  };
}

/**
 * Abre una conexión SFTP y ejecuta `fn(sftp, conn)`.
 * Cierra la conexión cuando fn resuelve o rechaza.
 */
function withSftp(fn) {
  const { host, user, password } = getConfig();
  if (!password) {
    return Promise.reject(new Error("SFTP_PASSWORD no está definida en las variables de entorno"));
  }
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const done = (fn2, val) => { if (!settled) { settled = true; fn2(val); } };

    conn.on("error", (err) => { console.error(`[SFTP-Postulantes] error: ${err.message}`); done(reject, err); });
    conn.on("ready", () => {
      conn.sftp(async (err, sftp) => {
        if (err) { conn.end(); return done(reject, err); }
        try {
          const result = await fn(sftp);
          conn.end();
          done(resolve, result);
        } catch (e) {
          conn.end();
          done(reject, e);
        }
      });
    });
    console.log(`[SFTP-Postulantes] Conectando → host=${host} user=${user}`);
    conn.connect({ host, port: 22, username: user, password, readyTimeout: 30000 });
  });
}

/** Obtiene el mtime (Unix seconds) del archivo remoto sin descargarlo. */
function getRemoteMtime(remotePath) {
  return withSftp((sftp) =>
    new Promise((res, rej) => {
      sftp.stat(remotePath, (err, attrs) => {
        if (err) return rej(err);
        res(attrs.mtime); // segundos Unix
      });
    })
  );
}

/** Descarga el archivo remoto a un Buffer en memoria. */
function downloadBuffer(remotePath) {
  return withSftp((sftp) =>
    new Promise((res, rej) => {
      const chunks = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on("data",  (c) => chunks.push(c));
      stream.on("error", rej);
      stream.on("close", () => {
        const buf = Buffer.concat(chunks);
        console.log(`[SFTP-Postulantes] Transferencia completa, bytes=${buf.length}`);
        res(buf);
      });
    })
  );
}

/**
 * Descarga el archivo cargue_postulantes del SFTP y lo parsea.
 * Estructura del Excel:
 *   - Fila 0: vacía (se salta con range:1)
 *   - Fila 1: encabezados (COD_PROGRAMA_CURSO, IDENTIFICACION, CORREO, NOMBRES, APELLIDOS, ...)
 *   - Fila 2+: datos
 *
 * @param {string} [codigoPrograma] Si se especifica, filtra solo las filas de ese programa.
 * @returns {Promise<Array>} Array de objetos con los campos del Excel.
 */
export async function descargarYFiltrarPostulantes(codigoPrograma) {
  const { path: SFTP_PATH } = getConfig();

  // 1. Consultar mtime del archivo en el servidor (operación rápida, ~1s)
  const remoteMtime = await getRemoteMtime(SFTP_PATH);
  console.log(`[SFTP-Postulantes] mtime remoto: ${remoteMtime} (${new Date(remoteMtime * 1000).toISOString()})`);

  // 2. Si el archivo no cambió, usar el buffer en caché; si cambió, descargarlo
  let buffer = getCachedIfFresh(remoteMtime);
  if (!buffer) {
    console.log("[SFTP-Postulantes] Archivo actualizado o primer acceso — transfiriendo...");
    buffer = await downloadBuffer(SFTP_PATH);
    setCache(buffer, remoteMtime);
  }

  const workbook  = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet     = workbook.Sheets[sheetName];

  // range:1 salta la primera fila vacía; la fila 1 del Excel se convierte en headers
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });
  console.log(`[SFTP-Postulantes] Total filas parseadas: ${rows.length}`);

  if (rows.length > 0) {
    const colKeys = Object.keys(rows[0]);
    console.log(`[SFTP-Postulantes] Columnas detectadas (${colKeys.length}): ${colKeys.join(" | ")}`);
  }

  const normalize = (v) => String(v ?? "").trim();

  // El Excel tiene COD_PROGRAMA_CURSO y COD_PROGRAMA_CURSO2 — mapeamos ambas
  const parsed = rows.map((row) => ({
    codProgramaCurso:  normalize(row["COD_PROGRAMA_CURSO"]),
    codProgramaCurso2: normalize(row["COD_PROGRAMA_CURSO2"] || ""),
    tituloCurso:       normalize(row["TITULO_PROGRAMA_CURSO"] || row["TITULO_PROGRAMA_CURSO2"] || ""),
    identificacion:    normalize(row["IDENTIFICACION"]),
    codigoEstudiante:  normalize(row["CODIGO"] || ""),   // código académico (academicId en perfil)
    correo:            normalize(row["EMAIL"] || row["CORREO"] || row["MAIL"] || ""),
    nombres:           normalize(row["NOMBRES"]   || row["NOMBRE"]  || ""),
    apellidos:         normalize(row["APELLIDOS"] || row["APELLIDO"]|| ""),
    genero:            normalize(row["GENERO"]    || ""),
    celular:           normalize(row["CELULAR"]   || row["TELEFONO"] || ""),
    sede:              normalize(row["SEDE"]      || row["COD_SEDE"] || ""),
    periodo:           normalize(row["PERIODO"]   || ""),
    tipoPractica:      normalize(row["TIPO_PRACTICA"] || ""),
    // Ubicación nacimiento
    paisNacimiento:    normalize(row["PAIS_NACIMIENTO"]  || row["COD_PAIS_NAC"]  || ""),
    deptoNacimiento:   normalize(row["DEPTO_NACIMIENTO"] || row["COD_DEPTO_NAC"] || ""),
    ciudadNacimiento:  normalize(row["CIUDAD_NACIMIENTO"]|| row["COD_CIUDAD_NAC"]|| ""),
    // Ubicación residencia
    paisResidencia:    normalize(row["PAIS_RESIDENCIA"]  || row["COD_PAIS_RES"]  || ""),
    deptoResidencia:   normalize(row["DEPTO_RESIDENCIA"] || row["COD_DEPTO_RES"] || ""),
    ciudadResidencia:  normalize(row["CIUDAD_RESIDENCIA"]|| row["COD_CIUDAD_RES"]|| ""),
    // Otros datos personales
    direccion:         normalize(row["DIRECCION"] || row["DIRECCION_RESIDENCIA"] || ""),
    fechaNacimiento:   normalize(row["FECHA_NACIMIENTO"] || row["FECHA_NAC"] || ""),
  }));

  if (codigoPrograma) {
    const cod = codigoPrograma.trim().toUpperCase();

    // Filtra si el programa aparece en la columna principal O en la secundaria
    const filtrados = parsed.filter(r =>
      r.codProgramaCurso.toUpperCase()  === cod ||
      r.codProgramaCurso2.toUpperCase() === cod
    );

    // Para cada resultado, aseguramos que codProgramaCurso refleje el programa buscado
    const resultado = filtrados.map(r => ({
      ...r,
      codProgramaCurso: cod, // normalizar al código buscado sin importar en qué columna estaba
    }));

    console.log(`[SFTP-Postulantes] Filtrados por "${cod}": ${resultado.length} (col1: ${parsed.filter(r => r.codProgramaCurso.toUpperCase() === cod).length}, col2: ${parsed.filter(r => r.codProgramaCurso2.toUpperCase() === cod).length})`);
    resultado.forEach((r, i) => console.log(`[SFTP-Postulantes]   [${i+1}] id=${r.identificacion} | nombre=${r.nombres} ${r.apellidos} | col2=${r.codProgramaCurso2}`));
    return resultado;
  }

  return parsed;
}

/**
 * Una sola conexión/descarga/parseo del Excel; filtra filas cuyo programa (col1 o col2)
 * coincida con cualquiera de los códigos indicados.
 * @param {string[]} codigosPrograma Códigos UXXI (ej. SNIES/plan)
 * @returns {Promise<Array>} Mismas filas que descargarYFiltrarPostulantes; codProgramaCurso = código que hizo match
 */
export async function descargarYFiltrarPostulantesMultiples(codigosPrograma) {
  const codesSet = new Set(
    (codigosPrograma || [])
      .map((c) => String(c ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
  if (codesSet.size === 0) {
    console.log("[SFTP-Postulantes] Multiples: sin códigos — 0 filas");
    return [];
  }

  const { path: SFTP_PATH } = getConfig();
  const remoteMtime = await getRemoteMtime(SFTP_PATH);
  console.log(`[SFTP-Postulantes] Multiples (${codesSet.size} códigos) — mtime ${remoteMtime}`);

  let buffer = getCachedIfFresh(remoteMtime);
  if (!buffer) {
    console.log("[SFTP-Postulantes] Multiples — transfiriendo una vez...");
    buffer = await downloadBuffer(SFTP_PATH);
    setCache(buffer, remoteMtime);
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });
  const normalize = (v) => String(v ?? "").trim();

  const parsed = rows.map((row) => ({
    codProgramaCurso: normalize(row["COD_PROGRAMA_CURSO"]),
    codProgramaCurso2: normalize(row["COD_PROGRAMA_CURSO2"] || ""),
    tituloCurso: normalize(row["TITULO_PROGRAMA_CURSO"] || row["TITULO_PROGRAMA_CURSO2"] || ""),
    identificacion: normalize(row["IDENTIFICACION"]),
    codigoEstudiante: normalize(row["CODIGO"] || ""),
    correo: normalize(row["EMAIL"] || row["CORREO"] || row["MAIL"] || ""),
    nombres: normalize(row["NOMBRES"] || row["NOMBRE"] || ""),
    apellidos: normalize(row["APELLIDOS"] || row["APELLIDO"] || ""),
    genero: normalize(row["GENERO"] || ""),
    celular: normalize(row["CELULAR"] || row["TELEFONO"] || ""),
    sede: normalize(row["SEDE"] || row["COD_SEDE"] || ""),
    periodo: normalize(row["PERIODO"] || ""),
    tipoPractica: normalize(row["TIPO_PRACTICA"] || ""),
    paisNacimiento: normalize(row["PAIS_NACIMIENTO"] || row["COD_PAIS_NAC"] || ""),
    deptoNacimiento: normalize(row["DEPTO_NACIMIENTO"] || row["COD_DEPTO_NAC"] || ""),
    ciudadNacimiento: normalize(row["CIUDAD_NACIMIENTO"] || row["COD_CIUDAD_NAC"] || ""),
    paisResidencia: normalize(row["PAIS_RESIDENCIA"] || row["COD_PAIS_RES"] || ""),
    deptoResidencia: normalize(row["DEPTO_RESIDENCIA"] || row["COD_DEPTO_RES"] || ""),
    ciudadResidencia: normalize(row["CIUDAD_RESIDENCIA"] || row["COD_CIUDAD_RES"] || ""),
    direccion: normalize(row["DIRECCION"] || row["DIRECCION_RESIDENCIA"] || ""),
    fechaNacimiento: normalize(row["FECHA_NACIMIENTO"] || row["FECHA_NAC"] || ""),
  }));

  const resultado = [];
  for (const r of parsed) {
    const c1 = r.codProgramaCurso.toUpperCase();
    const c2 = r.codProgramaCurso2.toUpperCase();
    let matched = null;
    if (codesSet.has(c1)) matched = c1;
    else if (codesSet.has(c2)) matched = c2;
    if (!matched) continue;
    resultado.push({ ...r, codProgramaCurso: matched });
  }

  console.log(`[SFTP-Postulantes] Multiples — ${resultado.length} filas para códigos: ${[...codesSet].join(", ")}`);
  return resultado;
}

/**
 * Normaliza claves de fila (DOCUMENTO, Cod_Programa, etc.) a campos fijos.
 */
function normalizeEgresadosRow(row) {
  const m = {};
  for (const [k, v] of Object.entries(row || {})) {
    const nk = String(k).trim().toLowerCase().replace(/\s+/g, "");
    m[nk] = v;
  }
  const documento = String(m.documento ?? "").trim();
  const email = String(m.email ?? "").trim();
  const codPrograma = String(m.cod_programa ?? m.codprograma ?? "").trim();
  const fechaGradoRaw = m.fecha_grado ?? m.fechagrado ?? "";
  const titulo = String(m.titulo ?? m.título ?? "").trim();
  return { documento, email, codPrograma, fechaGradoRaw, titulo };
}

/**
 * Parsea FECHA_GRADO: DD/MM/YYYY, o serial Excel, o ISO.
 * @returns {Date|null}
 */
export function parseFechaGradoEgresados(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + Math.round(v) * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

/**
 * Descarga CARGUE_EGRESADOSUR.xlsx (misma ruta base que cargue_postulantes).
 * Columnas esperadas: DOCUMENTO, EMAIL, COD_PROGRAMA, FECHA_GRADO, TITULO.
 * Misma convención que postulantes: primera fila vacía → range:1; si no, sin range.
 */
export async function descargarCargueEgresadosUr() {
  const { path: remotePath } = getEgresadosConfig();
  const remoteMtime = await getRemoteMtime(remotePath);
  console.log(`[SFTP-Egresados] mtime: ${remoteMtime} (${new Date(remoteMtime * 1000).toISOString()})`);

  let buffer = getCachedEgresadosIfFresh(remoteMtime);
  if (!buffer) {
    console.log("[SFTP-Egresados] Descargando archivo…");
    buffer = await downloadBuffer(remotePath);
    setCacheEgresados(buffer, remoteMtime);
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  let rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, range: 1 });
  if (rows.length > 0) {
    const first = normalizeEgresadosRow(rows[0]);
    if (!first.documento && !first.codPrograma) {
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    }
  }

  const parsed = rows.map((row) => {
    const n = normalizeEgresadosRow(row);
    const fechaGrado = parseFechaGradoEgresados(n.fechaGradoRaw);
    return {
      ...n,
      fechaGrado,
    };
  }).filter((r) => r.documento || r.codPrograma);

  console.log(`[SFTP-Egresados] Filas útiles: ${parsed.length}`);
  if (parsed.length > 0) {
    console.log(`[SFTP-Egresados] Columnas ejemplo: ${Object.keys(rows[0] || {}).join(" | ")}`);
  }
  return parsed;
}
