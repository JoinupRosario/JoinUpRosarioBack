import bcrypt                from "bcryptjs";
import EstudianteHabilitado from "./estudianteHabilitado.model.js";
import CondicionCurricular   from "../condicionesCurriculares/condicionCurricular.model.js";
import User                  from "../users/user.model.js";
import Postulant             from "../postulants/models/postulants.schema.js";
import PostulantProfile      from "../postulants/models/profile/profile.schema.js";
import PostulantAcademic     from "../postulants/models/postulant_academic.schema.js";
import ProgramFaculty        from "../program/model/programFaculty.model.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram } from "../postulants/models/profile/index.js";
import { descargarYFiltrarPostulantesMultiples } from "./carguePostulantes.sftp.js";
import { consultaInfAcademica, consultaAsignatura } from "../../services/uxxiIntegration.service.js";
import { evaluarTodasLasReglas }        from "./reglasEvaluador.service.js";

// ── Helper: pequeño sleep para no saturar OSB ─────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET /estudiantes-habilitados/me-autorizado
 * Indica si el usuario autenticado (estudiante) está AUTORIZADO en estudiantes habilitados.
 * Usado en el home del estudiante para mostrar u ocultar el botón "Prácticas y Pasantías".
 * Busca por user (User._id) o por postulant (Postulant._id del postulante ligado a este User).
 */
export const getMeAutorizado = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }
    const postulantDoc = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    const postulantId = postulantDoc?._id ?? null;
    const filter = {
      estadoFinal: "AUTORIZADO",
      $or: [{ user: userId }],
    };
    if (postulantId) {
      filter.$or.push({ postulant: postulantId });
    }
    const count = await EstudianteHabilitado.countDocuments(filter);
    res.json({ autorizado: count > 0 });
  } catch (e) {
    res.status(500).json({ message: "Error al verificar autorización", error: e.message });
  }
};

/**
 * GET /estudiantes-habilitados
 * Listado paginado con filtros.
 */
export const getEstudiantesHabilitados = async (req, res) => {
  try {
    const {
      page = 1, limit = 15,
      periodo, codigoPrograma, estadoCurricular, search,
    } = req.query;

    const filter = {};
    if (periodo)          filter.periodo        = periodo;
    if (codigoPrograma)   filter.codigoPrograma = codigoPrograma;
    if (estadoCurricular) filter.estadoCurricular = estadoCurricular;
    if (search) {
      const re = new RegExp(search.trim(), "i");
      filter.$or = [
        { identificacion: re },
        { nombres: re },
        { apellidos: re },
        { correo: re },
        { nombrePrograma: re },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [total, data] = await Promise.all([
      EstudianteHabilitado.countDocuments(filter),
      EstudianteHabilitado.find(filter)
        .populate("postulant", "_id alternateEmail")
        .populate("user", "name email code")
        .populate("periodo", "codigo tipo")
        .populate("tipoPractica", "value")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
    ]);

    const userIdsNeedPostulant = [];
    for (const row of data) {
      const pid = row.postulant?._id;
      if (pid) row.perfilPostulanteId = pid;
      else if (row.user?._id) userIdsNeedPostulant.push(row.user._id);
    }
    if (userIdsNeedPostulant.length) {
      const postulants = await Postulant.find({ postulantId: { $in: userIdsNeedPostulant } })
        .select("_id postulantId")
        .lean();
      const byUser = new Map(postulants.map((p) => [String(p.postulantId), p._id]));
      for (const row of data) {
        if (!row.perfilPostulanteId && row.user?._id) {
          const found = byUser.get(String(row.user._id));
          if (found) row.perfilPostulanteId = found;
        }
      }
    }

    res.json({
      data,
      pagination: {
        total, page: parseInt(page), limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (e) {
    res.status(500).json({ message: "Error listando estudiantes habilitados", error: e.message });
  }
};

/**
 * POST /estudiantes-habilitados/preview-uxxi
 * Uno o varios programas: una sola descarga SFTP + parseo; filtra todas las filas de esos códigos.
 * programasSeleccionados: [{ programaFacultadId, codigoPrograma }, ...]
 */
export const previewCargueUxxi = async (req, res) => {
  const {
    programaFacultadId,
    codigoPrograma,
    programasSeleccionados,
    periodoId,
    codigoPeriodo,
  } = req.body;

  if (!periodoId) {
    return res.status(400).json({ message: "Se requiere periodoId" });
  }

  let lista = [];
  if (Array.isArray(programasSeleccionados) && programasSeleccionados.length > 0) {
    lista = programasSeleccionados
      .map((p) => ({
        programaFacultadId: p.programaFacultadId,
        codigoPrograma: (p.codigoPrograma || "").trim(),
      }))
      .filter((p) => p.codigoPrograma);
  } else if (programaFacultadId && codigoPrograma) {
    lista = [{ programaFacultadId, codigoPrograma: String(codigoPrograma).trim() }];
  }

  if (lista.length === 0) {
    return res.status(400).json({
      message: "Seleccione al menos un programa con código válido (programasSeleccionados o codigoPrograma).",
    });
  }

  const codeToPfId = new Map();
  for (const item of lista) {
    codeToPfId.set(item.codigoPrograma.toUpperCase(), item.programaFacultadId);
  }
  const codigosUnicos = [...new Set(lista.map((x) => x.codigoPrograma.toUpperCase()))];

  try {
    console.log(`[previewUxxi] SFTP una vez — ${codigosUnicos.length} código(s) de programa`);
    const filasExcel = await descargarYFiltrarPostulantesMultiples(codigosUnicos);

    const countByCode = Object.fromEntries(codigosUnicos.map((c) => [c, 0]));
    for (const f of filasExcel) {
      const k = String(f.codProgramaCurso || "").toUpperCase();
      if (k in countByCode) countByCode[k]++;
    }
    const resumenPorPrograma = codigosUnicos.map((cod) => ({
      codigoPrograma: lista.find((x) => x.codigoPrograma.toUpperCase() === cod)?.codigoPrograma || cod,
      total: countByCode[cod],
    }));

    if (filasExcel.length === 0) {
      return res.json({
        total: 0,
        autorizados: 0,
        noAutorizados: 0,
        enRevision: 0,
        estudiantes: [],
        resumenPorPrograma,
        mensaje: `No se encontraron estudiantes en UXXI para los programa(s) seleccionado(s).`,
      });
    }

    const todasReglas = await CondicionCurricular.find({ periodo: periodoId, estado: "ACTIVE" })
      .populate({
        path: "asignaturasRequeridas.asignatura",
        select: "nombreAsignatura codAsignatura idAsignatura",
      })
      .lean();

    /** Evita llamar Consulta_asignatura varias veces para el mismo doc+plan en un mismo preview */
    const cacheAsignaturasUxxi = new Map();
    const getItemsAsignatura = async (documento, planCode) => {
      const key = `${String(documento).trim()}|${String(planCode).trim().toUpperCase()}`;
      if (cacheAsignaturasUxxi.has(key)) return cacheAsignaturasUxxi.get(key);
      try {
        const items = (await consultaAsignatura(documento, planCode)) || [];
        cacheAsignaturasUxxi.set(key, items);
        return items;
      } catch (e) {
        console.warn(`[previewUxxi] consultaAsignatura doc=${documento} plan=${planCode}:`, e.message);
        cacheAsignaturasUxxi.set(key, []);
        return [];
      }
    };
    const reglasCache = new Map();
    const reglasParaPf = (pfId) => {
      const key = String(pfId);
      if (!reglasCache.has(key)) {
        reglasCache.set(
          key,
          todasReglas.filter((r) => {
            const progs = r.programas || [];
            if (progs.length === 0) return true;
            return progs.some((p) => String(p) === key);
          })
        );
      }
      return reglasCache.get(key);
    };

    const resultados = [];
    for (let i = 0; i < filasExcel.length; i++) {
      const fila = filasExcel[i];
      const codigoProgramaRow = String(fila.codProgramaCurso || "").trim();
      const programaFacultadIdRow = codeToPfId.get(codigoProgramaRow.toUpperCase());
      if (!programaFacultadIdRow) continue;

      const { identificacion, correo, nombres, apellidos, codigoEstudiante, genero, celular } = fila;
      if (!identificacion) continue;

      const emailNorm = (correo || "").toLowerCase().trim();
      const userDoc = await User.findOne({
        $or: [
          { code: String(identificacion) },
          ...(emailNorm ? [{ email: emailNorm }] : []),
        ],
      }).lean();
      const postulantDoc = userDoc
        ? await Postulant.findOne({ postulantId: userDoc._id }).lean()
        : null;

      let infoAcad = [];
      let errorOSB = null;
      let datosAcad = null;
      try {
        infoAcad = await consultaInfAcademica(identificacion) || [];
        const planData = infoAcad.find(
          (p) => (p.codigoplan || "").toUpperCase() === codigoProgramaRow.toUpperCase()
        );
        datosAcad = planData || null;
      } catch (err) {
        errorOSB = err.message;
      }

      const reglasAplicables = reglasParaPf(programaFacultadIdRow);
      let estadoCurricular = "EN_REVISION";
      let reglasEvaluadas = [];
      if (!errorOSB && reglasAplicables.length > 0) {
        const necesitaAsignaturas = reglasAplicables.some(
          (r) => Array.isArray(r.asignaturasRequeridas) && r.asignaturasRequeridas.length > 0
        );
        const itemsAsignatura = necesitaAsignaturas
          ? await getItemsAsignatura(identificacion, codigoProgramaRow)
          : [];
        const resultado = evaluarTodasLasReglas(
          reglasAplicables,
          infoAcad,
          codigoProgramaRow,
          itemsAsignatura
        );
        estadoCurricular = resultado.estadoCurricular;
        reglasEvaluadas = resultado.reglasEvaluadas;
      }

      resultados.push({
        identificacion,
        codigoEstudiante: codigoEstudiante || "",
        correo: correo || userDoc?.email || "",
        nombres: nombres || userDoc?.name || "",
        apellidos,
        genero: genero || "",
        celular: celular || "",
        codigoPrograma: codigoProgramaRow,
        nombrePrograma: datosAcad?.nombreprograma || "",
        codigoPeriodo,
        estadoCurricular,
        reglasEvaluadas,
        datosAcademicos: datosAcad,
        todosLosPlanesOSB: infoAcad,
        errorOSB,
        userId: userDoc?._id || null,
        postulantId: postulantDoc?._id || null,
        existeEnBD: !!userDoc,
        programaFacultadId: String(programaFacultadIdRow),
      });

      await sleep(100);
    }

    const autorizados = resultados.filter((r) => r.estadoCurricular === "AUTORIZADO").length;
    const noAutorizados = resultados.filter((r) => r.estadoCurricular === "NO_AUTORIZADO").length;
    const enRevision = resultados.filter((r) => r.estadoCurricular === "EN_REVISION").length;

    const vacios = resumenPorPrograma.filter((r) => r.total === 0);
    const mensaje =
      vacios.length === codigosUnicos.length
        ? null
        : vacios.length > 0
          ? `Algunos programas sin filas en UXXI: ${vacios.map((v) => v.codigoPrograma).join(", ")}.`
          : null;

    return res.json({
      total: resultados.length,
      autorizados,
      noAutorizados,
      enRevision,
      estudiantes: resultados,
      resumenPorPrograma,
      ...(mensaje && { mensaje }),
    });
  } catch (e) {
    console.error("[previewUxxi] ERROR FATAL:", e.message);
    console.error(e.stack);
    res.status(500).json({ message: "Error procesando cargue UXXI", error: e.message });
  }
};

/**
 * POST /estudiantes-habilitados/confirmar-cargue
 * Recibe el preview ya calculado (o los IDs) y guarda en BD.
 * Upsert por identificacion + periodo + codigoPrograma para no duplicar.
 *
 * Body: { estudiantes: [...], periodoId, codigoPeriodo, programaFacultadId,
 *          codigoPrograma, tipoPracticaId, sedeId }
 */
export const confirmarCargueUxxi = async (req, res) => {
  const {
    estudiantes = [],
    periodoId,
    codigoPeriodo,
    programaFacultadId,
    codigoPrograma,
    tipoPracticaId,
    sedeId,
  } = req.body;

  if (!estudiantes.length) {
    return res.status(400).json({ message: "No hay estudiantes para guardar" });
  }

  const cargadoPor = req.user?.email || "sistema";
  let guardados = 0;
  let actualizados = 0;
  const errores = [];

  for (const est of estudiantes) {
    try {
      const filtro = {
        identificacion: est.identificacion,
        periodo:        periodoId,
        codigoPrograma: est.codigoPrograma || codigoPrograma,
      };

      const pfId = est.programaFacultadId || programaFacultadId || null;
      const update = {
        postulant:        est.postulantId   || null,
        user:             est.userId        || null,
        identificacion:   est.identificacion,
        correo:           est.correo        || "",
        nombres:          est.nombres       || "",
        apellidos:        est.apellidos     || "",
        codigoPrograma:   est.codigoPrograma || codigoPrograma,
        nombrePrograma:   est.nombrePrograma || "",
        programaFacultad: pfId,
        periodo:          periodoId,
        codigoPeriodo:    codigoPeriodo     || "",
        tipoPractica:     tipoPracticaId    || null,
        sede:             sedeId            || null,
        estadoCurricular: est.estadoCurricular,
        estadoFinal:      est.estadoCurricular,
        reglasEvaluadas:  est.reglasEvaluadas || [],
        datosAcademicos:  est.datosAcademicos  || null,
        cargadoPor,
        fechaCargue:      new Date(),
      };

      const doc = await EstudianteHabilitado.findOneAndUpdate(
        filtro,
        { $set: update },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (doc.createdAt?.getTime() === doc.updatedAt?.getTime()) {
        guardados++;
      } else {
        actualizados++;
      }
    } catch (err) {
      errores.push({ identificacion: est.identificacion, error: err.message });
    }
  }

  res.json({
    message: `Cargue completado: ${guardados} nuevos, ${actualizados} actualizados, ${errores.length} errores.`,
    guardados,
    actualizados,
    errores,
  });
};

/**
 * POST /estudiantes-habilitados/crear-usuarios-bd
 * Recibe los estudiantes del preview que NO existen en BD (existeEnBD=false)
 * y crea el User (modulo: 'estudiante') + Postulant para cada uno.
 * Devuelve la lista actualizada con userId/postulantId y existeEnBD=true.
 */
export const crearUsuariosBD = async (req, res) => {
  const { estudiantes = [], cargadoPor = "sistema" } = req.body;

  if (!Array.isArray(estudiantes) || estudiantes.length === 0) {
    return res.status(400).json({ message: "No se enviaron estudiantes para crear." });
  }

  const creados  = [];
  const omitidos = [];
  const errores  = [];

  // Caché de ProgramFaculty por code para no repetir queries
  const pfCache = {};
  const getPF = async (code) => {
    if (!code) return null;
    const k = code.toUpperCase();
    if (pfCache[k] === undefined) {
      pfCache[k] = await ProgramFaculty.findOne({ code: k }).lean() || null;
    }
    return pfCache[k];
  };

  for (const est of estudiantes) {
    const {
      identificacion, codigoEstudiante, correo, nombres, apellidos,
      genero, celular, codigoPrograma, todosLosPlanesOSB = [],
    } = est;

    if (!identificacion || !correo) {
      omitidos.push({ identificacion, razon: "Sin identificación o correo" });
      continue;
    }

    try {
      // ── 1. User — buscar por documento O email ───────────────────────────────
      const emailNorm = correo.toLowerCase().trim();
      let userDoc = await User.findOne({
        $or: [
          { code: String(identificacion) },
          { email: emailNorm },
        ],
      });
      if (!userDoc) {
        const passwordHash = await bcrypt.hash(String(identificacion), 10);
        const fullName = [nombres, apellidos].filter(Boolean).join(" ").trim() || `Estudiante ${identificacion}`;
        userDoc = await User.create({
          name:                fullName,
          email:               correo.toLowerCase().trim(),
          code:                String(identificacion),
          password:            passwordHash,
          modulo:              "estudiante",
          estado:              true,
          debeCambiarPassword: true,
          directorioActivo:    false,
        });
        console.log(`[crearUsuariosBD] User creado: ${userDoc._id} (${identificacion})`);
      } else {
        console.log(`[crearUsuariosBD] User ya existía: ${userDoc._id} (${identificacion})`);
      }

      // ── 2. Postulant ─────────────────────────────────────────────────────────
      let postulantDoc = await Postulant.findOne({ postulantId: userDoc._id });
      if (!postulantDoc) {
        postulantDoc = await Postulant.create({
          postulantId:       userDoc._id,
          alternateEmail:    correo.toLowerCase().trim(),
          phone:             celular || "",
          fillingPercentage: 0,
          filled:            false,
        });
        console.log(`[crearUsuariosBD] Postulant creado: ${postulantDoc._id} (${identificacion})`);
      }

      // ── 3. PostulantProfile ──────────────────────────────────────────────────
      // studentCode: código de matrícula (CODIGO del Excel) o identificacion como fallback
      const studentCode = codigoEstudiante || String(identificacion);
      let profileDoc = await PostulantProfile.findOne({ postulantId: postulantDoc._id });
      if (!profileDoc) {
        profileDoc = await PostulantProfile.create({
          postulantId:  postulantDoc._id,
          studentCode,
          filled:       false,
          dateCreation: new Date(),
          userCreator:  cargadoPor,
        });
        console.log(`[crearUsuariosBD] PostulantProfile creado: ${profileDoc._id} (${identificacion})`);
      }

      // ── 4. postulant_academic (resumen en curso / finalizado) ─────────────────
      // Toma el primer plan en curso (egresado='N') y el primer plan finalizado (egresado='S')
      const planEnCurso    = todosLosPlanesOSB.find(p => String(p.egresado || "").toUpperCase() !== "S");
      const planFinalizado = todosLosPlanesOSB.find(p => String(p.egresado || "").toUpperCase() === "S");
      const pfEnCurso      = planEnCurso    ? await getPF(planEnCurso.codigoplan)    : null;
      const pfFinalizado   = planFinalizado ? await getPF(planFinalizado.codigoplan) : null;

      await PostulantAcademic.findOneAndUpdate(
        { postulant: postulantDoc._id },
        {
          postulant:              postulantDoc._id,
          current_faculty_code:   pfEnCurso?.facultyId?.code  || planEnCurso?.codigofacultad  || "",
          current_faculty_name:   pfEnCurso?.facultyId?.name  || planEnCurso?.nombrefacultad  || "",
          current_program_code:   planEnCurso?.codigoplan   || "",
          current_program_name:   planEnCurso?.nombreprograma || "",
          current_program_level:  planEnCurso?.nivelformacion || "",
          finished_faculty_code:  pfFinalizado?.facultyId?.code  || planFinalizado?.codigofacultad  || "",
          finished_faculty_name:  pfFinalizado?.facultyId?.name  || planFinalizado?.nombrefacultad  || "",
          finished_program_code:  planFinalizado?.codigoplan   || "",
          finished_program_name:  planFinalizado?.nombreprograma || "",
          finished_program_level: planFinalizado?.nivelformacion || "",
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[crearUsuariosBD] postulant_academic upsert OK (${identificacion})`);

      // ── 5. ProfileEnrolledProgram y ProfileGraduateProgram ────────────────────
      for (const plan of todosLosPlanesOSB) {
        const pf = await getPF(plan.codigoplan);
        const esGraduado = String(plan.egresado || "").toUpperCase() === "S";

        if (esGraduado) {
          // Programa finalizado
          if (pf) {
            await ProfileGraduateProgram.findOneAndUpdate(
              { profileId: profileDoc._id, programId: pf.programId },
              {
                profileId:       profileDoc._id,
                programId:       pf.programId,
                programFacultyId: pf._id,
                title:           plan.nombreprograma || "",
                endDate:         plan.fechagrado ? new Date(plan.fechagrado) : null,
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }
        } else {
          // Programa en curso
          if (pf) {
            await ProfileEnrolledProgram.findOneAndUpdate(
              { profileId: profileDoc._id, programId: pf.programId },
              {
                profileId:        profileDoc._id,
                programId:        pf.programId,
                programFacultyId: pf._id,
                dateCreation:     new Date(),
                userCreator:      cargadoPor,
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }
        }
      }
      console.log(`[crearUsuariosBD] Planes OSB procesados: ${todosLosPlanesOSB.length} (${identificacion})`);

      creados.push({
        ...est,
        userId:      userDoc._id,
        postulantId: postulantDoc._id,
        existeEnBD:  true,
      });

    } catch (err) {
      console.error(`[crearUsuariosBD] Error para ${identificacion}:`, err.message);
      const msg = err.code === 11000
        ? `Conflicto de clave única para ${identificacion} — puede que el email ya esté registrado`
        : err.message;
      errores.push({ identificacion, error: msg });
    }
  }

  res.json({
    message: `${creados.length} creados, ${omitidos.length} omitidos, ${errores.length} errores.`,
    creados,
    omitidos,
    errores,
  });
};
