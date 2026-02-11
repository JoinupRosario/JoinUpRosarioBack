import ProgramFaculty from "../model/programFaculty.model.js";
import Program from "../model/program.model.js";
import Faculty from "../../faculty/model/faculty.model.js";
import { getInfoProgramas } from "../../../services/uxxiIntegration.service.js";

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

export const getProgramFaculties = async (req, res) => {
  try {
    const { page = 1, limit = 10, programId, facultyId } = req.query;
    const filter = {};

    if (programId) filter.programId = programId;
    if (facultyId) filter.facultyId = facultyId;

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
