import * as XLSX from "xlsx";
import Asignatura from "./asignatura.model.js";
import User from "../users/user.model.js";
import { descargarYParsearAsignaturas } from "./asignatura.sftp.js";
import { buildSearchRegex } from "../../utils/searchUtils.js";

// ── Lógica de sync compartida (SFTP y Excel manual) ───────────────────────────
const makeKey = (r) => `${r.periodo}|${r.idAsignatura}|${r.codArea}`;
const n       = (v) => String(v ?? "").trim();

function mapRow(row) {
  return {
    nivel:              String(row["NIVEL"]               ?? "").trim(),
    periodo:            String(row["PERIODO"]             ?? "").trim(),
    idAsignatura:       String(row["ID_ASIGNATURA"]       ?? "").trim(),
    nombreAsignatura:   String(row["NOMBRE_ASIGNATURA"]   ?? "").trim(),
    codDepto:           String(row["COD_DEPTO"]           ?? "").trim(),
    nombreDepartamento: String(row["NOMBRE_DEPARTAMENTO"] ?? "").trim(),
    codArea:            String(row["COD_AREA"]            ?? "").trim(),
    nombreArea:         String(row["NOMBRE_AREA"]         ?? "").trim(),
    centroBeneficio:    String(row["CENTRO_BENEFICIO"]    ?? "").trim(),
    codAsignatura:      String(row["COD_ASIGNATURA"]      ?? "").trim(),
  };
}

function parsearBuffer(buffer) {
  const workbook  = XLSX.read(buffer, { type: "buffer" });
  const sheet     = workbook.Sheets[workbook.SheetNames[0]];
  // range:1 → salta fila 0 (vacía/título) y usa fila 1 como cabecera
  const rows      = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });
  console.log(`[EXCEL] Filas parseadas: ${rows.length}`);
  return rows.map(mapRow);
}

async function syncFilas(filasRaw, userEmail) {
  const filasValidas = filasRaw.filter(
    (r) => r.periodo?.trim() || r.idAsignatura?.trim() || r.codArea?.trim()
  );
  if (!filasValidas.length) return null; // señal de archivo vacío

  // Deduplicar — prefiere valores no vacíos cuando hay filas duplicadas
  const filaMap = new Map();
  for (const fila of filasValidas) {
    const key = makeKey(fila);
    if (!filaMap.has(key)) {
      filaMap.set(key, { ...fila });
    } else {
      const prev = filaMap.get(key);
      for (const campo of Object.keys(fila)) {
        if (!prev[campo] && fila[campo]) prev[campo] = fila[campo];
      }
    }
  }
  const filas        = Array.from(filaMap.values());
  const archivoKeySet = new Set(filas.map(makeKey));

  const todasEnBD = await Asignatura.find({}).select(
    "_id periodo idAsignatura codArea nivel nombreAsignatura codDepto nombreDepartamento nombreArea centroBeneficio codAsignatura estado"
  ).lean();
  const bdMap = new Map(todasEnBD.map((a) => [makeKey(a), a]));

  const upsertOps = [];
  let omitidas    = 0;

  for (const fila of filas) {
    const existente = bdMap.get(makeKey(fila));
    if (existente) {
      const igual =
        n(existente.nivel)              === n(fila.nivel)              &&
        n(existente.nombreAsignatura)   === n(fila.nombreAsignatura)   &&
        n(existente.codDepto)           === n(fila.codDepto)           &&
        n(existente.nombreDepartamento) === n(fila.nombreDepartamento) &&
        n(existente.nombreArea)         === n(fila.nombreArea)         &&
        n(existente.centroBeneficio)    === n(fila.centroBeneficio)    &&
        n(existente.codAsignatura)      === n(fila.codAsignatura)      &&
        existente.estado                === "ACTIVE";
      if (igual) { omitidas++; continue; }
    }
    upsertOps.push({
      updateOne: {
        filter: { periodo: fila.periodo, idAsignatura: fila.idAsignatura, codArea: fila.codArea },
        update: {
          $set:         { ...fila, estado: "ACTIVE", userUpdater: userEmail },
          $setOnInsert: { userCreator: userEmail },
        },
        upsert: true,
      },
    });
  }

  let creadas = 0;
  if (upsertOps.length > 0) {
    const result = await Asignatura.bulkWrite(upsertOps, { ordered: false });
    creadas = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  }

  const activasEnBD    = todasEnBD.filter((a) => a.estado === "ACTIVE");
  const paraDesactivar = activasEnBD
    .filter((a) => !archivoKeySet.has(makeKey(a)))
    .map((a)  => a._id);

  let desactivadas = 0;
  if (paraDesactivar.length > 0) {
    await Asignatura.updateMany(
      { _id: { $in: paraDesactivar } },
      { $set: { estado: "INACTIVE", userUpdater: userEmail } }
    );
    desactivadas = paraDesactivar.length;
  }

  return { totalArchivo: filas.length, creadas, omitidas, desactivadas };
}

// ── GET /asignaturas ──────────────────────────────────────────────────────────
export const getAsignaturas = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, estado, periodo } = req.query;
    const filter = {};
    if (estado)  filter.estado  = estado;
    if (periodo) filter.periodo = periodo;
    if (search) {
      const rx = buildSearchRegex(search);
      filter.$or = [
        { nombreAsignatura: rx }, { idAsignatura: rx }, { codAsignatura: rx },
        { nombreDepartamento: rx }, { nombreArea: rx }, { nivel: rx },
      ];
    }
    const pageNum  = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const [data, total] = await Promise.all([
      Asignatura.find(filter).sort({ periodo: -1, nombreAsignatura: 1 })
        .skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      Asignatura.countDocuments(filter),
    ]);
    res.json({ data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /asignaturas/sync-sftp ───────────────────────────────────────────────
export const syncAsignaturasFromSftp = async (req, res) => {
  try {
    let userEmail = "";
    if (req.user?.id) {
      const u = await User.findById(req.user.id).select("email").lean();
      userEmail = u?.email ?? "";
    }

    let filasRaw;
    try {
      filasRaw = await descargarYParsearAsignaturas();
    } catch (sftpErr) {
      console.error("[SFTP] Error:", sftpErr);
      return res.status(502).json({
        success: false,
        message: `Error al conectar con el servidor SFTP: ${sftpErr.message}`,
      });
    }

    const resumen = await syncFilas(filasRaw, userEmail);
    if (!resumen) return res.status(200).json({ success: false, message: "El archivo no contiene datos válidos." });

    return res.json({ success: true, message: "Sincronización completada.", resumen });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /asignaturas/sync-excel ──────────────────────────────────────────────
export const syncAsignaturasFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No se recibió ningún archivo." });
    }

    let userEmail = "";
    if (req.user?.id) {
      const u = await User.findById(req.user.id).select("email").lean();
      userEmail = u?.email ?? "";
    }

    let filasRaw;
    try {
      filasRaw = parsearBuffer(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: `Error al leer el archivo Excel: ${parseErr.message}` });
    }

    const resumen = await syncFilas(filasRaw, userEmail);
    if (!resumen) return res.status(400).json({ success: false, message: "El archivo no contiene datos válidos o la estructura no es correcta." });

    return res.json({ success: true, message: "Sincronización completada.", resumen });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /asignaturas/periodos ─────────────────────────────────────────────────
export const getPeriodosAsignaturas = async (req, res) => {
  try {
    const periodos = await Asignatura.distinct("periodo");
    res.json({ data: periodos.sort().reverse() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
