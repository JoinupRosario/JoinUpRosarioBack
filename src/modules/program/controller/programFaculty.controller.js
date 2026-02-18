import ProgramFaculty from "../model/programFaculty.model.js";
import Program from "../model/program.model.js";
import Faculty from "../../faculty/model/faculty.model.js";
import User from "../../users/user.model.js";
import { getInfoProgramas, getProgramasFromOSB } from "../../../services/uxxiIntegration.service.js";

const normalizeCode = (c) => String(c ?? "").trim();

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
 * Llama OSB Consulta_programas; compara programas por code (planestudio) y relaciones (programId+facultyId).
 * Devuelve conteos y listas de programas y relaciones a crear.
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

    const programCodesFromApi = new Map();
    for (const row of apiRows) {
      const code = normalizeCode(row.planestudio);
      if (!code) continue;
      if (!programCodesFromApi.has(code)) {
        programCodesFromApi.set(code, row.nombre_programa);
      }
    }

    const dbPrograms = await Program.find({}).select("code").lean();
    const dbProgramCodesSet = new Set(dbPrograms.map((p) => normalizeCode(p.code)));
    const newPrograms = [];
    for (const [code, name] of programCodesFromApi) {
      if (!dbProgramCodesSet.has(code)) {
        newPrograms.push({ planestudio: code, nombre_programa: name || code });
      }
    }

    const dbFaculties = await Faculty.find({}).select("code").lean();
    const facultyCodeToId = new Map(dbFaculties.map((f) => [normalizeCode(f.code), f._id.toString()]));
    const dbProgramsByCode = await Program.find({}).select("code").lean();
    const programCodeToId = new Map(dbProgramsByCode.map((p) => [normalizeCode(p.code), p._id.toString()]));
    const existingRelations = await ProgramFaculty.find({}).select("programId facultyId").lean();
    const relationKeySet = new Set(
      existingRelations.map((r) => `${r.programId.toString()}|${r.facultyId.toString()}`)
    );

    const newRelations = [];
    for (const row of apiRows) {
      const planestudio = normalizeCode(row.planestudio);
      const codFacultad = normalizeCode(row.cod_facultad);
      if (!planestudio || !codFacultad) continue;
      const facultyId = facultyCodeToId.get(codFacultad);
      if (!facultyId) continue;
      const programId = programCodeToId.get(planestudio);
      if (!programId) {
        if (programCodesFromApi.has(planestudio)) {
          newRelations.push({
            planestudio,
            cod_facultad: row.cod_facultad,
            nombre_programa: row.nombre_programa,
            nombre_facultad: row.nombre_facultad,
            activo: row.activo || "SI",
          });
        }
        continue;
      }
      const key = `${programId}|${facultyId}`;
      if (!relationKeySet.has(key)) {
        newRelations.push({
          planestudio,
          cod_facultad: row.cod_facultad,
          nombre_programa: row.nombre_programa,
          nombre_facultad: row.nombre_facultad,
          activo: row.activo || "SI",
        });
      }
    }

    const dbProgramsCount = await Program.countDocuments({});
    const dbRelationsCount = await ProgramFaculty.countDocuments({});
    const apiProgramsCount = programCodesFromApi.size;
    const apiRelationsCount = apiRows.length;

    return res.json({
      success: true,
      dbProgramsCount,
      apiProgramsCount,
      newProgramsCount: newPrograms.length,
      newPrograms,
      dbRelationsCount,
      apiRelationsCount,
      newRelationsCount: newRelations.length,
      newRelations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /program-faculties/create-from-universitas
 * Body: { newPrograms: [...], newRelations: [...] }
 * Crea programas faltantes y luego relaciones programa-facultad; userCreator con email del usuario.
 * No hace throw: procesa todos los ítems, recoge errores y siempre responde 200 con resumen (created + errors).
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

  const { newPrograms = [], newRelations = [] } = req.body || {};
  const createdPrograms = [];
  let programCodeToId;
  try {
    programCodeToId = new Map(
      (await Program.find({}).select("code").lean()).map((p) => [normalizeCode(p.code), p._id.toString()])
    );
  } catch (err) {
    errors.push({ message: err.message, context: "load programs" });
    programCodeToId = new Map();
  }

  for (const p of newPrograms) {
    try {
      const code = normalizeCode(p.planestudio ?? p.code);
      const name = (p.nombre_programa ?? p.name ?? "").toString().trim().substring(0, 255);
      if (!code || !name) continue;
      if (programCodeToId.has(code)) continue;
      const program = await Program.create({
        code,
        name,
        status: "ACTIVE",
        userCreator: userCreatorEmail || undefined,
        dateCreation: new Date(),
      });
      programCodeToId.set(code, program._id.toString());
      createdPrograms.push({ _id: program._id, code: program.code, name: program.name });
    } catch (err) {
      errors.push({
        message: err.message,
        item: `programa ${(p.planestudio ?? p.code ?? "").toString().trim()} - ${(p.nombre_programa ?? p.name ?? "").toString().trim().substring(0, 80)}`,
      });
    }
  }

  let facultyCodeToId;
  try {
    facultyCodeToId = new Map(
      (await Faculty.find({}).select("code").lean()).map((f) => [normalizeCode(f.code), f._id.toString()])
    );
  } catch (err) {
    errors.push({ message: err.message, context: "load faculties" });
    facultyCodeToId = new Map();
  }

  const createdRelationsDetail = [];
  for (const r of newRelations) {
    try {
      const planestudio = normalizeCode(r.planestudio);
      const codFacultad = normalizeCode(r.cod_facultad);
      if (!planestudio || !codFacultad) continue;
      const programId = programCodeToId.get(planestudio);
      const facultyId = facultyCodeToId.get(codFacultad);
      if (!programId || !facultyId) {
        errors.push({
          message: programId ? "Facultad no encontrada" : "Programa no encontrado",
          item: `relación ${planestudio} + ${codFacultad}`,
        });
        continue;
      }
      const exists = await ProgramFaculty.findOne({ programId, facultyId });
      if (exists) continue;
      const rel = await ProgramFaculty.create({
        programId,
        facultyId,
        code: planestudio,
        status: "ACTIVE",
        activo: r.activo === "NO" ? "NO" : "SI",
        userCreator: userCreatorEmail || undefined,
        dateCreation: new Date(),
      });
      createdRelationsDetail.push({ _id: rel._id, programId, facultyId });
    } catch (err) {
      errors.push({
        message: err.message,
        item: `relación ${(r.planestudio ?? "").toString().trim()} + ${(r.cod_facultad ?? "").toString().trim()}`,
      });
    }
  }

  const createdRelations = createdRelationsDetail.length;
  const message =
    errors.length === 0
      ? `Se crearon ${createdPrograms.length} programa(s) y ${createdRelations} relación(es) programa-facultad.`
      : `Proceso completado con observaciones: ${createdPrograms.length} programa(s), ${createdRelations} relación(es) creados; ${errors.length} error(es).`;

  return res.status(200).json({
    success: true,
    message,
    createdPrograms,
    createdRelations: createdRelationsDetail,
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
        codigoPrograma: program?.code ?? pf.code,
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
