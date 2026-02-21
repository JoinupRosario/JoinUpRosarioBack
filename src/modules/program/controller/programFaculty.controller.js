import ProgramFaculty from "../model/programFaculty.model.js";
import Program from "../model/program.model.js";
import Faculty from "../../faculty/model/faculty.model.js";
import User from "../../users/user.model.js";
import { getInfoProgramas, getProgramasFromOSB } from "../../../services/uxxiIntegration.service.js";

const normalizeCode = (c) => String(c ?? "").trim();
const normalizeName = (s) => String(s ?? "").trim().toUpperCase();

// Mapeo tipo_estudio → level y labelLevel
const TIPO_ESTUDIO_MAP = {
  MOF: { level: "MOF", labelLevel: "POSGRADO" },
  PSC: { level: "PR",  labelLevel: "PREGRADO" },
  TCL: { level: "DO",  labelLevel: "DOCTORADO" },
};

/** RQ02_HU003: Sincronizar planes (programas por facultad) desde UXXI (getInfoProgramas). Botón de integración. */
export const syncPlansFromUXXI = async (req, res) => {
  try {
    let list;
    try {
      list = await getInfoProgramas();
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: "Error al conectar con UXXI (getInfoProgramas). Verificar UXXI_GET_PROGRAMAS_URL.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
    if (list == null) {
      return res.status(200).json({
        success: false,
        message: "Integración UXXI no configurada. Definir UXXI_GET_PROGRAMAS_URL en .env.",
        synced: 0,
      });
    }
    let created = 0;
    let updated = 0;
    for (const p of list) {
      const faculty = await Faculty.findOne({ code: p.codigoFacultad });
      if (!faculty) continue; // ignorar si la facultad no existe
      let program = await Program.findOne({ code: p.codigoPrograma });
      if (!program) {
        program = await Program.create({
          code: p.codigoPrograma,
          name: p.nombrePrograma,
          level: "Pregrado",
          status: p.estado || "ACTIVE",
        });
      } else {
        await Program.updateOne(
          { _id: program._id },
          { $set: { name: p.nombrePrograma, status: p.estado || program.status } }
        );
      }
      const existing = await ProgramFaculty.findOne({
        programId: program._id,
        facultyId: faculty._id,
      });
      if (existing) {
        await ProgramFaculty.updateOne(
          { _id: existing._id },
          { $set: { status: p.estado || existing.status, code: p.codigoPrograma } }
        );
        updated++;
      } else {
        await ProgramFaculty.create({
          programId: program._id,
          facultyId: faculty._id,
          code: p.codigoPrograma,
          status: p.estado || "ACTIVE",
          activo: "SI",
        });
        created++;
      }
    }
    return res.status(200).json({
      success: true,
      message: "Sincronización de planes desde UXXI completada.",
      synced: list.length,
      created,
      updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /program-faculties/compare-universitas
 * Compara por NOMBRE de programa (no por código planestudio).
 * - newPrograms: nombres que vienen de UXXI y NO existen en BD.
 * - newRelations: filas de UXXI cuya combinación (facultyId + programId + planestudio) no existe en BD.
 * - toDeactivateRelations: program_faculties ACTIVAS en BD que NO aparecen en UXXI.
 */
export const compareProgramsWithUniversitas = async (req, res) => {
  try {
    let apiRows;
    try {
      apiRows = await getProgramasFromOSB();
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: "Error al conectar con OSB (Consulta_programas). Revisar URL_OSB, USS_URJOB y PASS_URJOB.",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }

    // ── 1. Programas únicos por nombre en la respuesta UXXI ─────────────────
    const apiProgramsByName = new Map(); // nombreNorm → row
    for (const row of apiRows) {
      const key = normalizeName(row.nombre_programa);
      if (key && !apiProgramsByName.has(key)) apiProgramsByName.set(key, row);
    }

    // ── 2. Programas nuevos (no existen en BD por nombre) ───────────────────
    const dbPrograms = await Program.find({}).select("name _id").lean();
    const dbProgramNamesSet = new Set(dbPrograms.map((p) => normalizeName(p.name)));
    const programNameToId = new Map(dbPrograms.map((p) => [normalizeName(p.name), p._id.toString()]));

    const newPrograms = [];
    for (const [nameKey, row] of apiProgramsByName) {
      if (!dbProgramNamesSet.has(nameKey)) {
        newPrograms.push({
          nombre_programa: row.nombre_programa,
          tipo_estudio: row.tipo_estudio,
          activo: row.activo,
        });
      }
    }

    // ── 3. Mapas de apoyo ────────────────────────────────────────────────────
    const allFaculties = await Faculty.find({}).select("code _id").lean();
    const facultyCodeToId = new Map(
      allFaculties.map((f) => [normalizeCode(String(f.code)), f._id.toString()])
    );

    // Relaciones existentes indexadas por (programId|facultyId|code)
    const existingPFs = await ProgramFaculty.find({}).select("programId facultyId code status").lean();
    const existingPFKeySet = new Set(
      existingPFs.map((pf) =>
        `${pf.programId?.toString()}|${pf.facultyId?.toString()}|${normalizeCode(pf.code)}`
      )
    );

    // ── 4. Relaciones nuevas ─────────────────────────────────────────────────
    const newRelations = [];
    for (const row of apiRows) {
      const nameKey     = normalizeName(row.nombre_programa);
      const codFacStr   = normalizeCode(String(row.cod_facultad));
      const planestudio = normalizeCode(row.planestudio);
      if (!nameKey || !codFacStr || !planestudio) continue;

      const facultyId = facultyCodeToId.get(codFacStr);
      if (!facultyId) continue;

      // programId puede existir ya o estar en newPrograms (aún no creado)
      const programId = programNameToId.get(nameKey);
      const pfKey = programId
        ? `${programId}|${facultyId}|${planestudio}`
        : null;

      if (!pfKey || !existingPFKeySet.has(pfKey)) {
        newRelations.push({
          nombre_programa: row.nombre_programa,
          nombre_facultad: row.nombre_facultad,
          cod_facultad: row.cod_facultad,
          planestudio: row.planestudio,
          tipo_estudio: row.tipo_estudio,
          activo: row.activo,
        });
      }
    }

    // ── 5. Relaciones a inactivar (ACTIVAS en BD que no están en UXXI) ───────
    const apiPFKeySet = new Set(
      apiRows.map((row) =>
        `${normalizeCode(String(row.cod_facultad))}|${normalizeName(row.nombre_programa)}|${normalizeCode(row.planestudio)}`
      )
    );

    const activePFs = await ProgramFaculty.find({ status: "ACTIVE" })
      .populate("facultyId", "code")
      .populate("programId", "name")
      .lean();

    const toDeactivateRelations = [];
    for (const pf of activePFs) {
      const facCode  = normalizeCode(String(pf.facultyId?.code ?? ""));
      const progName = normalizeName(pf.programId?.name ?? "");
      const pfCode   = normalizeCode(pf.code ?? "");
      if (!facCode || !progName || !pfCode) continue;
      if (!apiPFKeySet.has(`${facCode}|${progName}|${pfCode}`)) {
        toDeactivateRelations.push({
          _id: pf._id.toString(),
          programName: pf.programId?.name ?? "",
          facultyCode: pf.facultyId?.code ?? "",
          code: pf.code ?? "",
        });
      }
    }

    // ── 6. Programas ACTIVOS en BD que NO vienen en UXXI → inactivar ────────
    const allDbPrograms = await Program.find({}).select("name _id status createdAt").lean();
    const toDeactivatePrograms = allDbPrograms.filter((p) => {
      const isActive = ["ACTIVE", "active", "1"].includes(String(p.status ?? "").trim());
      return isActive && !apiProgramsByName.has(normalizeName(p.name));
    }).map((p) => ({ _id: p._id.toString(), name: p.name }));

    // ── 7. Programas duplicados por nombre en BD (solo ACTIVOS) ─────────────
    // Solo se consideran duplicados los programas activos; los ya inactivos se ignoran
    const activeDbPrograms = allDbPrograms.filter((p) =>
      ["ACTIVE", "active", "1"].includes(String(p.status ?? "").trim())
    );
    const programsByName = new Map(); // nombreNorm → [doc, ...]
    for (const p of activeDbPrograms) {
      const key = normalizeName(p.name);
      if (!key) continue;
      if (!programsByName.has(key)) programsByName.set(key, []);
      programsByName.get(key).push(p);
    }

    // Por cada grupo con >1 doc: conservar el más antiguo (menor _id = creado primero), marcar el resto
    const duplicatePrograms = [];
    for (const [, group] of programsByName) {
      if (group.length <= 1) continue;
      // Ordenar por _id ascendente → el primero es el más antiguo
      const sorted = [...group].sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
      for (const dup of sorted.slice(1)) {
        duplicatePrograms.push({ _id: dup._id.toString(), name: dup.name });
      }
    }

    return res.json({
      success: true,
      dbProgramsCount: dbPrograms.length,
      apiProgramsCount: apiProgramsByName.size,
      newProgramsCount: newPrograms.length,
      newPrograms,
      dbRelationsCount: existingPFs.length,
      apiRelationsCount: apiRows.length,
      newRelationsCount: newRelations.length,
      newRelations,
      toDeactivateRelations,
      toDeactivatePrograms,
      duplicatePrograms,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /program-faculties/create-from-universitas
 * Body: { newPrograms, newRelations, toDeactivateRelations }
 *
 * - newPrograms: programas a crear, únicos por nombre (sin code, con level/labelLevel desde tipo_estudio).
 * - newRelations: relaciones a crear, verificadas por (programId + facultyId + planestudio).
 * - toDeactivateRelations: array de { _id } de program_faculties a inactivar.
 */
export const createProgramsFromUniversitas = async (req, res) => {
  const errors = [];
  let userCreatorEmail = "";
  try {
    if (req.user?.id) {
      const currentUser = await User.findById(req.user.id).select("email").lean();
      userCreatorEmail = (currentUser?.email ?? "").toString().trim();
    }
  } catch (err) {
    errors.push({ message: err.message, context: "userCreator" });
  }

  const {
    newPrograms = [],
    newRelations = [],
    toDeactivateRelations = [],
    toDeactivatePrograms = [],
    duplicatePrograms = [],
  } = req.body || {};

  // ── 1. Crear programas nuevos (dedup por nombre) ──────────────────────────
  // Cargar programas existentes por nombre para no duplicar
  let programNameToId;
  try {
    programNameToId = new Map(
      (await Program.find({}).select("name").lean()).map((p) => [normalizeName(p.name), p._id.toString()])
    );
  } catch (err) {
    errors.push({ message: err.message, context: "load programs" });
    programNameToId = new Map();
  }

  const createdPrograms = [];
  for (const p of newPrograms) {
    try {
      const name    = (p.nombre_programa ?? p.name ?? "").toString().trim().substring(0, 255);
      const nameKey = normalizeName(name);
      if (!name || !nameKey) continue;
      if (programNameToId.has(nameKey)) continue; // ya existe por nombre

      const tipoEstudio = (p.tipo_estudio ?? "").toString().trim().toUpperCase();
      const { level = "", labelLevel = "" } = TIPO_ESTUDIO_MAP[tipoEstudio] ?? {};
      const status = String(p.activo ?? "S").trim().toUpperCase() === "S" ? "ACTIVE" : "INACTIVE";

      const program = await Program.create({
        name,
        level,
        labelLevel,
        status,
        userCreator: userCreatorEmail || undefined,
        dateCreation: new Date(),
      });
      programNameToId.set(nameKey, program._id.toString());
      createdPrograms.push({ _id: program._id, name: program.name, level: program.level, labelLevel: program.labelLevel });
    } catch (err) {
      errors.push({
        message: err.message,
        item: `programa "${(p.nombre_programa ?? "").toString().trim().substring(0, 80)}"`,
      });
    }
  }

  // ── 2. Cargar facultades ──────────────────────────────────────────────────
  let facultyCodeToId;
  try {
    facultyCodeToId = new Map(
      (await Faculty.find({}).select("code").lean()).map((f) => [normalizeCode(String(f.code)), f._id.toString()])
    );
  } catch (err) {
    errors.push({ message: err.message, context: "load faculties" });
    facultyCodeToId = new Map();
  }

  // ── 3. Crear relaciones nuevas (dedup por programId + facultyId + code) ───
  const createdRelationsDetail = [];
  for (const r of newRelations) {
    try {
      const planestudio = normalizeCode(r.planestudio);
      const codFacultad = normalizeCode(String(r.cod_facultad));
      const nameKey     = normalizeName(r.nombre_programa);
      if (!planestudio || !codFacultad || !nameKey) continue;

      const programId = programNameToId.get(nameKey);
      const facultyId = facultyCodeToId.get(codFacultad);

      if (!programId || !facultyId) {
        errors.push({
          message: !programId ? "Programa no encontrado en BD" : "Facultad no encontrada en BD",
          item: `relación "${r.nombre_programa}" + facultad ${r.cod_facultad}`,
        });
        continue;
      }

      // Verificar duplicado por las 3 claves
      const exists = await ProgramFaculty.findOne({ programId, facultyId, code: planestudio });
      if (exists) continue;

      const activo  = String(r.activo ?? "S").trim().toUpperCase() === "S" ? "SI" : "NO";
      const status  = activo === "SI" ? "ACTIVE" : "INACTIVE";

      const rel = await ProgramFaculty.create({
        programId,
        facultyId,
        code: planestudio,
        status,
        activo,
        userCreator: userCreatorEmail || undefined,
        dateCreation: new Date(),
      });
      createdRelationsDetail.push({ _id: rel._id, programId, facultyId, code: planestudio });
    } catch (err) {
      errors.push({
        message: err.message,
        item: `relación "${(r.nombre_programa ?? "").toString().trim()}" + facultad ${(r.cod_facultad ?? "").toString().trim()}`,
      });
    }
  }

  // ── 4. Inactivar relaciones que ya no están en UXXI ──────────────────────
  let deactivatedRelationsCount = 0;
  if (toDeactivateRelations.length > 0) {
    try {
      const ids = toDeactivateRelations.map((r) => r._id).filter(Boolean);
      const result = await ProgramFaculty.updateMany(
        { _id: { $in: ids } },
        {
          $set: {
            status: "INACTIVE",
            activo: "NO",
            userUpdater: userCreatorEmail || undefined,
            dateUpdate: new Date(),
          },
        }
      );
      deactivatedRelationsCount = result.modifiedCount;
    } catch (err) {
      errors.push({ message: err.message, context: "deactivate relations" });
    }
  }

  // ── 5. Inactivar programas que ya no están en UXXI ───────────────────────
  let deactivatedProgramsCount = 0;
  const allProgramIdsToDeactivate = [
    ...toDeactivatePrograms.map((p) => p._id),
    ...duplicatePrograms.map((p) => p._id),
  ].filter(Boolean);

  if (allProgramIdsToDeactivate.length > 0) {
    try {
      const result = await Program.updateMany(
        { _id: { $in: allProgramIdsToDeactivate } },
        {
          $set: {
            status: "INACTIVE",
            userUpdater: userCreatorEmail || undefined,
            dateUpdate: new Date(),
          },
        }
      );
      deactivatedProgramsCount = result.modifiedCount;
    } catch (err) {
      errors.push({ message: err.message, context: "deactivate programs" });
    }
  }

  const createdRelations = createdRelationsDetail.length;
  const message =
    errors.length === 0
      ? `Se crearon ${createdPrograms.length} programa(s) y ${createdRelations} relación(es). Se inactivaron ${deactivatedProgramsCount} programa(s) y ${deactivatedRelationsCount} relación(es).`
      : `Proceso completado con observaciones: ${createdPrograms.length} prog, ${createdRelations} rel creados; ${deactivatedProgramsCount} prog, ${deactivatedRelationsCount} rel inactivados; ${errors.length} error(es).`;

  return res.status(200).json({
    success: true,
    message,
    createdPrograms,
    createdRelations: createdRelationsDetail,
    deactivatedRelationsCount,
    deactivatedProgramsCount,
    errors: errors.length ? errors : undefined,
  });
};

export const getProgramFaculties = async (req, res) => {
  try {
    const { page = 1, limit = 10, programId, facultyId, status } = req.query;
    const filter = {};

    if (programId) filter.programId = programId;
    if (facultyId) filter.facultyId = facultyId;
    if (status) filter.status = String(status).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [raw, total] = await Promise.all([
      ProgramFaculty.find(filter)
        .populate("programId", "name code level labelLevel status")
        .populate("facultyId", "name code facultyId")
        .sort({ mysqlId: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProgramFaculty.countDocuments(filter),
    ]);

    // Fallback: si programId/facultyId están vacíos pero tenemos program_id/faculty_id (MySQL), resolver por mysqlId
    let programByMysqlId = new Map();
    let facultyByMysqlId = new Map();
    const needProgramIds = [...new Set(raw.filter((pf) => !pf.programId && pf.program_id != null).map((pf) => pf.program_id))];
    const needFacultyIds = [...new Set(raw.filter((pf) => !pf.facultyId && pf.faculty_id != null).map((pf) => pf.faculty_id))];
    if (needProgramIds.length) {
      const programs = await Program.find({ $or: [{ mysqlId: { $in: needProgramIds } }, { mysql_id: { $in: needProgramIds } }] }).lean();
      programs.forEach((p) => {
        const id = p.mysqlId ?? p.mysql_id;
        if (id != null) programByMysqlId.set(id, p);
      });
    }
    if (needFacultyIds.length) {
      const faculties = await Faculty.find({ $or: [{ mysqlId: { $in: needFacultyIds } }, { facultyId: { $in: needFacultyIds } }, { faculty_id: { $in: needFacultyIds } }] }).lean();
      faculties.forEach((f) => {
        const id = f.mysqlId ?? f.facultyId ?? f.faculty_id;
        if (id != null) facultyByMysqlId.set(id, f);
      });
    }

    // RQ02_HU003: Formato parametrización Planes. Alias program/faculty; usar ref o fallback por MySQL id.
    const data = raw.map((pf) => {
      const program = pf.programId || (pf.program_id != null ? programByMysqlId.get(pf.program_id) : null);
      const faculty = pf.facultyId || (pf.faculty_id != null ? facultyByMysqlId.get(pf.faculty_id) : null);
      return {
        ...pf,
        program,
        faculty,
        codigoFacultad: faculty?.code ?? pf.codigoFacultad,
        nombreFacultad: faculty?.name ?? pf.nombreFacultad,
        codigoPrograma: pf.code ?? pf.codigoPrograma,   // planestudio (código de relación en program_faculties)
        codigoProgramaModel: program?.code,              // código del modelo programs
        nombrePrograma: program?.name ?? pf.nombrePrograma,
        tipoEstudio: faculty ? { _id: faculty._id, code: faculty.code, name: faculty.name } : null,
        estado: pf.status,
        centroCosto: pf.costCentre,
        snies: pf.snies,
        registroCalificado: pf.officialRegistration,
        fechaRegistroCalificado: pf.officialRegistrationDate,
        activo: pf.activo ?? "SI",
      };
    });

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProgramFacultyById = async (req, res) => {
  try {
    const doc = await ProgramFaculty.findById(req.params.id)
      .populate("programId")
      .populate("facultyId");
    if (!doc) {
      return res.status(404).json({ message: "Relación programa-facultad no encontrada" });
    }
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProgramFacultyByLegacyId = async (req, res) => {
  try {
    const doc = await ProgramFaculty.findOne({
      programFacultyId: parseInt(req.params.programFacultyId, 10),
    })
      .populate("programId")
      .populate("facultyId");
    if (!doc) {
      return res.status(404).json({ message: "Relación programa-facultad no encontrada" });
    }
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Programas por facultad */
export const getProgramsByFaculty = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      return res.status(404).json({ message: "Facultad no encontrada" });
    }
    const links = await ProgramFaculty.find({ facultyId })
      .populate("programId", "name code level labelLevel status")
      .lean();
    res.json({ faculty, programs: links.map((l) => l.programId).filter(Boolean) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Facultades por programa */
export const getFacultiesByProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({ message: "Programa no encontrado" });
    }
    const links = await ProgramFaculty.find({ programId })
      .populate("facultyId", "name code facultyId")
      .lean();
    res.json({ program, faculties: links.map((l) => l.facultyId).filter(Boolean) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createProgramFaculty = async (req, res) => {
  try {
    const { program, faculty, program_id, faculty_id } = req.body;
    const programDoc = program ? await Program.findById(program) : program_id ? await Program.findOne({ mysqlId: program_id }) : null;
    const facultyDoc = faculty ? await Faculty.findById(faculty) : faculty_id != null ? await Faculty.findOne({ facultyId: faculty_id }) : null;
    if (!programDoc || !facultyDoc) {
      return res.status(400).json({
        message: "Debe indicar program y faculty (ObjectId) o program_id y faculty_id (legacy) válidos",
      });
    }
    const existing = await ProgramFaculty.findOne({
      programId: programDoc._id,
      facultyId: facultyDoc._id,
    });
    if (existing) {
      return res.status(409).json({ message: "Esta relación programa-facultad ya existe", data: existing });
    }
    const doc = await ProgramFaculty.create({
      programId: programDoc._id,
      facultyId: facultyDoc._id,
      ...(req.body.programFacultyId != null && { programFacultyId: req.body.programFacultyId }),
      code: req.body.code,
      status: req.body.status ?? "ACTIVE",
      activo: req.body.activo ?? "SI",
      costCentre: req.body.costCentre ?? req.body.centroCosto,
      snies: req.body.snies,
      officialRegistration: req.body.officialRegistration ?? req.body.registroCalificado,
      officialRegistrationDate: req.body.officialRegistrationDate ?? req.body.fechaRegistroCalificado,
      practiceDuration: req.body.practiceDuration,
    });
    await doc.populate("programId", "name code");
    await doc.populate("facultyId", "name code facultyId");
    res.status(201).json(doc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateProgramFaculty = async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.centroCosto !== undefined) body.costCentre = body.centroCosto;
    if (body.registroCalificado !== undefined) body.officialRegistration = body.registroCalificado;
    if (body.fechaRegistroCalificado !== undefined) body.officialRegistrationDate = body.fechaRegistroCalificado;
    const doc = await ProgramFaculty.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    )
      .populate("programId", "name code")
      .populate("facultyId", "name code facultyId");
    if (!doc) {
      return res.status(404).json({ message: "Relación programa-facultad no encontrada" });
    }
    res.json(doc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteProgramFaculty = async (req, res) => {
  try {
    const doc = await ProgramFaculty.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Relación programa-facultad no encontrada" });
    }
    res.json({ message: "Relación programa-facultad eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
