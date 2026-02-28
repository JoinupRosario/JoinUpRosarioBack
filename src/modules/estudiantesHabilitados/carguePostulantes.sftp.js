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

function getConfig() {
  return {
    host:     process.env.SFTP_HOST     || "35.208.21.19",
    user:     process.env.SFTP_USER     || "urosariosftp",
    password: process.env.SFTP_PASSWORD || "",
    path:     process.env.SFTP_POSTULANTES_PATH || "/upload/process/cargue_postulantes.xlsx",
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
    codigoEstudiante:  normalize(row["CODIGO"] || ""),   // código académico (matrícula)
    correo:            normalize(row["EMAIL"] || row["CORREO"] || row["MAIL"] || ""),
    nombres:           normalize(row["NOMBRES"]   || row["NOMBRE"]  || ""),
    apellidos:         normalize(row["APELLIDOS"] || row["APELLIDO"]|| ""),
    genero:            normalize(row["GENERO"]    || ""),
    celular:           normalize(row["CELULAR"]   || ""),
    sede:              normalize(row["SEDE"]      || row["COD_SEDE"]|| ""),
    periodo:           normalize(row["PERIODO"]   || ""),
    tipoPractica:      normalize(row["TIPO_PRACTICA"] || ""),
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
