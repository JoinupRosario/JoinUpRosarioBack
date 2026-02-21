import { Client } from "ssh2";
import * as XLSX from "xlsx";

// Las variables se leen dentro de la función para asegurar que dotenv ya cargó
function getConfig() {
  return {
    host:     process.env.SFTP_HOST                 || "35.208.21.19",
    user:     process.env.SFTP_USER                 || "urosariosftp",
    password: process.env.SFTP_PASSWORD             || "",
    path:     process.env.SFTP_ASIGNATURAS_PATH     || "/upload/process/ASIGNATURAS_OFERTADAS_UXXI.xlsx",
  };
}

function downloadBuffer(remotePath) {
  const { host, user, password } = getConfig();

  console.log(`[SFTP] Conectando → host=${host} user=${user} pass_len=${password.length}`);

  if (!password) {
    return Promise.reject(new Error("SFTP_PASSWORD no está definida en las variables de entorno"));
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const done = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    conn.on("error", (err) => {
      console.error(`[SFTP] error: ${err.message}`);
      done(reject, err);
    });

    conn.on("ready", () => {
      console.log("[SFTP] Autenticado OK, abriendo canal SFTP...");
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return done(reject, err); }

        console.log(`[SFTP] Descargando: ${remotePath}`);
        const chunks = [];
        const stream = sftp.createReadStream(remotePath);

        stream.on("data",  (chunk) => chunks.push(chunk));
        stream.on("error", (err)   => { conn.end(); done(reject, err); });
        stream.on("close", ()      => {
          conn.end();
          const buf = Buffer.concat(chunks);
          console.log(`[SFTP] Descarga completa, bytes=${buf.length}`);
          done(resolve, buf);
        });
      });
    });

    // El servidor solo acepta 'password' (confirmado por logs: no ofrece keyboard-interactive)
    conn.connect({
      host,
      port:         22,
      username:     user,
      password,
      readyTimeout: 30000,
    });
  });
}

/**
 * Conecta al SFTP, descarga el archivo en memoria y lo parsea.
 * @returns {Array<Object>} filas del Excel como objetos planos
 */
export async function descargarYParsearAsignaturas() {
  const { path: SFTP_PATH } = getConfig();
  const buffer = await downloadBuffer(SFTP_PATH);

  const workbook  = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet     = workbook.Sheets[sheetName];

  // range: 1 → salta la fila 0 (vacía/título) y usa la fila 1 como cabecera
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });

  console.log(`[SFTP] Filas parseadas: ${rows.length}`);

  return rows.map((row) => ({
    nivel:              String(row["NIVEL"]               ?? "").trim(),
    periodo:            String(row["PERIODO"]             ?? "").trim(),
    idAsignatura:       String(row["ID_ASIGNATURA"]       ?? "").trim(),
    nombreAsignatura:   String(row["NOMBRE_ASIGNATURA"]   ?? "").trim(),
    codDepto:           String(row["COD_DEPTO"]           ?? "").trim(),
    nombreDepartamento: String(row["NOMBRE_DEPARTAMENTO"] ?? "").trim(),
    codArea:            String(row["COD_AREA"]            ?? "").trim(),
    nombreArea:         String(row["NOMBRE_AREA"]         ?? "").trim(),
    centroBeneficio:    String(row["CENTRO_BENEFICIO"]    ?? row["CENTRO_BE_NEFICIO"] ?? "").trim(),
    codAsignatura:      String(row["COD_ASIGNATURA"]      ?? "").trim(),
  }));
}
