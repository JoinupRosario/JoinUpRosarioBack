import mongoose from "mongoose";
import Opportunity from "./opportunity.model.js";
import Company from "../companies/company.model.js";
import Student from "../students/student.model.js";
import EstudianteHabilitado from "../estudiantesHabilitados/estudianteHabilitado.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import PostulacionOportunidad from "./postulacionOportunidad.model.js";
import { ProfileEnrolledProgram, ProfileGraduateProgram, ProfileSkill, ProfileCv } from "../postulants/models/profile/index.js";
import Periodo from "../periodos/periodo.model.js";
import Country from "../shared/location/models/country.schema.js";
import City from "../shared/location/models/city.schema.js";
import Item from "../shared/reference-data/models/item.schema.js";
import { esAcuerdoDeVinculacion, iniciarFlujoAcuerdoVinculacion } from "../../services/acuerdoVinculacion.service.js";

const OBJECTID_REGEX = /^[a-f0-9]{24}$/i;
const LIST_ID_INTEREST_AREA = "L_INTEREST_AREA";
const LIST_ID_EMOTIONAL_SALARY = "L_EMOTIONAL_SALARY";
const LIST_ID_DEDICATION_JOB_OFFER = "L_DEDICATION_JOB_OFFER";
const LIST_ID_CONTRACT_TYPE_ACADEMIC_PRACTICE = "L_CONTRACT_TYPE_ACADEMIC_PRACTICE";

/** Normaliza periodo, pais y ciudad a ObjectId (refs). Acepta código o id. Modifica data in-place. */
async function normalizeOpportunityRefs(data) {
  if (data.periodo != null && data.periodo !== "") {
    const v = String(data.periodo).trim();
    if (OBJECTID_REGEX.test(v)) {
      data.periodo = new mongoose.Types.ObjectId(v);
    } else {
      const doc = await Periodo.findOne({ codigo: v }).select("_id").lean();
      data.periodo = doc ? doc._id : null;
    }
  }
  if (data.pais != null && data.pais !== "") {
    const v = String(data.pais).trim();
    if (OBJECTID_REGEX.test(v)) {
      data.pais = new mongoose.Types.ObjectId(v);
    } else {
      const doc = await Country.findOne({
        $or: [{ sortname: v }, { isoAlpha2: v }, { name: new RegExp(`^${escapeRegex(v)}$`, "i") }
        ]
      }).select("_id").lean();
      data.pais = doc ? doc._id : null;
    }
  }
  if (data.ciudad != null && data.ciudad !== "") {
    const v = String(data.ciudad).trim();
    if (OBJECTID_REGEX.test(v)) {
      data.ciudad = new mongoose.Types.ObjectId(v);
    } else {
      const doc = await City.findOne({ name: new RegExp(`^${escapeRegex(v)}$`, "i") }).select("_id").lean();
      data.ciudad = doc ? doc._id : null;
    }
  }

  // Área de desempeño: ref Item (L_INTEREST_AREA)
  if (data.areaDesempeno != null && data.areaDesempeno !== "") {
    const v = data.areaDesempeno;
    if (v._id && OBJECTID_REGEX.test(String(v._id))) {
      data.areaDesempeno = new mongoose.Types.ObjectId(v._id);
    } else {
      const s = String(v).trim();
      if (OBJECTID_REGEX.test(s)) {
        data.areaDesempeno = new mongoose.Types.ObjectId(s);
      } else {
        const doc = await Item.findOne({
          listId: LIST_ID_INTEREST_AREA,
          $or: [
            { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
            { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
          ]
        }).select("_id").lean();
        data.areaDesempeno = doc ? doc._id : null;
      }
    }
  }

  // Salario emocional: array de refs Item (L_EMOTIONAL_SALARY)
  if (Array.isArray(data.salarioEmocional)) {
    const resolved = [];
    for (const entry of data.salarioEmocional) {
      if (entry == null || entry === "") continue;
      const v = entry;
      if (v._id && OBJECTID_REGEX.test(String(v._id))) {
        resolved.push(new mongoose.Types.ObjectId(v._id));
      } else {
        const s = String(v).trim();
        if (OBJECTID_REGEX.test(s)) {
          resolved.push(new mongoose.Types.ObjectId(s));
        } else {
          const doc = await Item.findOne({
            listId: LIST_ID_EMOTIONAL_SALARY,
            $or: [
              { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
              { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
            ]
          }).select("_id").lean();
          if (doc) resolved.push(doc._id);
        }
      }
    }
    data.salarioEmocional = resolved;
  }

  // Dedicación: ref Item (L_DEDICATION_JOB_OFFER)
  if (data.dedicacion != null && data.dedicacion !== "") {
    const v = data.dedicacion;
    if (v._id && OBJECTID_REGEX.test(String(v._id))) {
      data.dedicacion = new mongoose.Types.ObjectId(v._id);
    } else {
      const s = String(v).trim();
      if (OBJECTID_REGEX.test(s)) {
        data.dedicacion = new mongoose.Types.ObjectId(s);
      } else {
        const doc = await Item.findOne({
          listId: LIST_ID_DEDICATION_JOB_OFFER,
          $or: [
            { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
            { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
          ]
        }).select("_id").lean();
        data.dedicacion = doc ? doc._id : null;
      }
    }
  }

  // Tipo de vinculación: ref Item (L_CONTRACT_TYPE_ACADEMIC_PRACTICE)
  if (data.tipoVinculacion != null && data.tipoVinculacion !== "") {
    const v = data.tipoVinculacion;
    if (v._id && OBJECTID_REGEX.test(String(v._id))) {
      data.tipoVinculacion = new mongoose.Types.ObjectId(v._id);
    } else {
      const s = String(v).trim();
      if (OBJECTID_REGEX.test(s)) {
        data.tipoVinculacion = new mongoose.Types.ObjectId(s);
      } else {
        const doc = await Item.findOne({
          listId: LIST_ID_CONTRACT_TYPE_ACADEMIC_PRACTICE,
          $or: [
            { value: new RegExp(`^${escapeRegex(s)}$`, "i") },
            { description: new RegExp(`^${escapeRegex(s)}$`, "i") }
          ]
        }).select("_id").lean();
        data.tipoVinculacion = doc ? doc._id : null;
      }
    }
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Obtener todas las oportunidades
export const getOpportunities = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      estado,
      tipo,
      tipoOportunidad,
      company,
      empresa,
      search,
      fechaVencimiento,
      numeroOportunidad,
      nombreCargo,
      fechaCierreDesde,
      fechaCierreHasta,
      formacionAcademica,
      estadosRevision,
      requisitos,
      empresaConfidenciales,
      sortField = 'fechaCreacion',
      sortDirection = 'desc'
    } = req.query;

    const filter = {};

    // Filtros básicos
    if (estado) filter.estado = estado;
    if (tipo) filter.tipo = tipo;
    if (tipoOportunidad) filter.tipo = tipoOportunidad;
    if (company) filter.company = company;
    if (empresa) {
      filter.company = empresa;
    }

    // Filtro por número de oportunidad (últimos 6 caracteres del ID)
    if (numeroOportunidad) {
      const opportunities = await Opportunity.find({}).select('_id');
      const matchingIds = opportunities
        .filter(opp => opp._id.toString().slice(-6).toLowerCase() === numeroOportunidad.toLowerCase())
        .map(opp => opp._id);
      if (matchingIds.length > 0) {
        filter._id = { $in: matchingIds };
      } else {
        // Si no hay coincidencias, retornar array vacío
        return res.json({
          opportunities: [],
          totalPages: 0,
          currentPage: parseInt(page),
          total: 0
        });
      }
    }

    // Filtro por nombre de cargo
    if (nombreCargo) {
      filter.nombreCargo = { $regex: nombreCargo, $options: "i" };
    }

    // Filtro por fechas de cierre
    if (fechaCierreDesde || fechaCierreHasta) {
      filter.fechaVencimiento = {};
      if (fechaCierreDesde) {
        filter.fechaVencimiento.$gte = new Date(fechaCierreDesde);
      }
      if (fechaCierreHasta) {
        filter.fechaVencimiento.$lte = new Date(fechaCierreHasta);
      }
    } else if (fechaVencimiento) {
      filter.fechaVencimiento = { $lte: new Date(fechaVencimiento) };
    }

    // Filtro por formación académica
    if (formacionAcademica) {
      filter["formacionAcademica.program"] = { $regex: formacionAcademica, $options: "i" };
    }

    // Filtro por estados de revisión
    if (estadosRevision) {
      filter.estado = estadosRevision;
    }

    // Filtro por requisitos
    if (requisitos) {
      filter.requisitos = { $regex: requisitos, $options: "i" };
    }

    // Filtro por empresas confidenciales
    if (empresaConfidenciales === 'true') {
      // Asumimos que las empresas confidenciales tienen requiereConfidencialidad = true
      filter.requiereConfidencialidad = true;
    }

    // Búsqueda por texto general
    if (search) {
      filter.$or = [
        { nombreCargo: { $regex: search, $options: "i" } },
        { funciones: { $regex: search, $options: "i" } },
        { requisitos: { $regex: search, $options: "i" } }
      ];
    }

    // Ordenamiento
    const sortOptions = {};
    const sortFieldMap = {
      'fechaCreacion': 'createdAt',
      'nombreCargo': 'nombreCargo',
      'fechaVencimiento': 'fechaVencimiento',
      'estado': 'estado'
    };
    const actualSortField = sortFieldMap[sortField] || sortField || 'createdAt';
    sortOptions[actualSortField] = sortDirection === 'asc' ? 1 : -1;

    const opportunities = await Opportunity.find(filter)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("tipoVinculacion", "value description listId")
      .populate("postulaciones.estudiante", "studentId faculty program")
      .populate("revisadoPor", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort(sortOptions);

    const total = await Opportunity.countDocuments(filter);

    // Conteo de aplicaciones: postulaciones embebidas + PostulacionOportunidad
    const opportunityIds = opportunities.map((o) => o._id);
    const countsFromPO = await PostulacionOportunidad.aggregate([
      { $match: { opportunity: { $in: opportunityIds } } },
      { $group: { _id: "$opportunity", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(countsFromPO.map((c) => [c._id.toString(), c.count]));
    const opportunitiesWithCount = opportunities.map((opp) => {
      const legacy = opp.postulaciones?.length || 0;
      const fromPO = countMap.get(opp._id.toString()) || 0;
      return { ...opp.toObject(), aplicacionesCount: legacy + fromPO };
    });

    res.json({
      opportunities: opportunitiesWithCount,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /opportunities/para-estudiante-practicas
 * Ofertas de práctica que el estudiante autenticado puede ver:
 * 1) Está en estudiantes_habilitados con estadoFinal "AUTORIZADO"
 * 2) La oportunidad está Activa y en el mismo periodo que el del estudiante autorizado
 * 3) El programa por el que está habilitado está en formacionAcademica de la oportunidad
 * 4) Ese programa está aprobado en aprobacionesPorPrograma de la oportunidad (estado "aprobado")
 */
export const getOfertasParaEstudiantePracticas = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const postulantDoc = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    const postulantId = postulantDoc?._id ?? null;
    const filterAutorizado = {
      estadoFinal: "AUTORIZADO",
      $or: [{ user: userId }],
    };
    if (postulantId) {
      filterAutorizado.$or.push({ postulant: postulantId });
    }

    const autorizados = await EstudianteHabilitado.find(filterAutorizado)
      .populate("periodo", "codigo")
      .populate({ path: "programaFacultad", select: "programId code", populate: { path: "programId", select: "name code" } })
      .lean();

    if (!autorizados.length) {
      return res.json({
        opportunities: [],
        totalPages: 0,
        currentPage: page,
        total: 0,
      });
    }

    // Oportunidad.periodo es ObjectId; usar solo IDs para el filtro (resolver códigos si hace falta)
    const OBJECTID_REGEX = /^[a-f0-9]{24}$/i;
    const periodIdsFromAuth = [...new Set(autorizados.map((a) => a.periodo?._id?.toString()).filter(Boolean))];
    const periodCodes = [...new Set(autorizados.map((a) => a.periodo?.codigo).filter(Boolean))];
    const periodIdsResolved = [...periodIdsFromAuth];
    if (periodCodes.length) {
      const periodosByCode = await Periodo.find({ codigo: { $in: periodCodes } }).select("_id").lean();
      periodosByCode.forEach((p) => {
        if (p._id) periodIdsResolved.push(p._id.toString());
      });
    }
    const periodObjectIds = [...new Set(periodIdsResolved)].filter((id) => OBJECTID_REGEX.test(id)).map((id) => new mongoose.Types.ObjectId(id));

    const programTerms = new Set();
    autorizados.forEach((a) => {
      const pf = a.programaFacultad;
      if (pf?.programId) {
        if (pf.programId.name) programTerms.add(pf.programId.name.trim());
        if (pf.programId.code) programTerms.add(pf.programId.code.trim());
      }
      if (pf?.code) programTerms.add(pf.code.trim());
      // Nombre del programa tal como viene en estudiantes_habilitados
      if (a.nombrePrograma) programTerms.add(a.nombrePrograma.trim());
    });
    const programTermsList = [...programTerms].filter(Boolean);
    if (!periodObjectIds.length || !programTermsList.length) {
      return res.json({
        opportunities: [],
        totalPages: 0,
        currentPage: page,
        total: 0,
      });
    }

    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = {
      tipo: "practica",
      estado: "Activa",
      periodo: { $in: periodObjectIds },
      $or: programTermsList.map((term) => ({
        "formacionAcademica.program": { $regex: escapeRegex(term), $options: "i" },
      })),
      // Que el programa del estudiante esté aprobado en la oportunidad
      aprobacionesPorPrograma: {
        $elemMatch: {
          estado: "aprobado",
          $or: programTermsList.map((term) => ({
            "programa.program": { $regex: escapeRegex(term), $options: "i" },
          })),
        },
      },
    };

    const allCandidates = await Opportunity.find(filter)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .sort({ fechaCreacion: -1 })
      .lean();

    // Filtrar por promedio mínimo: si la oportunidad tiene promedioMinimoRequerido,
    // el estudiante debe tener promedioacumulado >= ese valor (datosAcademicos de su autorización)
    const parseNum = (v) => {
      if (v == null || v === "") return NaN;
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    };
    let opportunitiesFiltered = allCandidates.filter((opp) => {
      const minPromedio = parseNum(opp.promedioMinimoRequerido);
      if (Number.isNaN(minPromedio)) return true; // sin requisito de promedio, se muestra

      const oppPeriodo = opp.periodo ? String(opp.periodo).trim() : "";
      const oppPrograms = (opp.formacionAcademica || []).map((f) => (f.program || "").trim().toLowerCase()).filter(Boolean);
      const matchingAuth = autorizados.find((a) => {
        const periodMatch =
          oppPeriodo === (a.periodo?._id?.toString?.() || "") || oppPeriodo === (a.periodo?.codigo || "");
        if (!periodMatch) return false;
        const prog = (a.nombrePrograma || "").trim().toLowerCase();
        const code = (a.programaFacultad?.programId?.code || "").trim().toLowerCase();
        const name = (a.programaFacultad?.programId?.name || "").trim().toLowerCase();
        return oppPrograms.some(
          (p) =>
            p && (prog.includes(p) || p.includes(prog) || code.includes(p) || p.includes(code) || name.includes(p) || p.includes(name))
        );
      });
      if (!matchingAuth) return true; // no hay autorización que matchee, se incluye (no debería pasar)
      const studentPromedio = parseNum(matchingAuth.datosAcademicos?.promedioacumulado);
      if (Number.isNaN(studentPromedio)) return true; // sin promedio del estudiante, se muestra
      return studentPromedio >= minPromedio;
    });

    // Excluir solo las ofertas a las que ya aplicó (comparación estricta por _id de oportunidad)
    if (postulantId) {
      const postulacionesYa = await PostulacionOportunidad.find({ postulant: postulantId })
        .select("opportunity")
        .lean();
      const idsAplicados = new Set();
      for (const p of postulacionesYa) {
        if (p.opportunity == null) continue;
        const idStr = String(p.opportunity).trim();
        if (idStr.length === 24) idsAplicados.add(idStr);
      }
      if (idsAplicados.size > 0) {
        opportunitiesFiltered = opportunitiesFiltered.filter((opp) => {
          const oppId = opp._id != null ? String(opp._id).trim() : "";
          return oppId.length !== 24 || !idsAplicados.has(oppId);
        });
      }
    }

    const total = opportunitiesFiltered.length;
    const opportunities = opportunitiesFiltered.slice(skip, skip + limit);

    res.json({
      opportunities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Error al listar ofertas para prácticas", error: error.message });
  }
};

// Obtener oportunidad por ID
export const getOpportunityById = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("company", "name commercialName sector logo contact")
      .populate("periodo", "codigo tipo estado")
      .populate("pais", "name sortname isoAlpha2")
      .populate("ciudad", "name codDian")
      .populate("dedicacion", "value description listId")
      .populate("tipoVinculacion", "value description listId")
      .populate("areaDesempeno", "value description listId")
      .populate("salarioEmocional", "value description listId")
      .populate("creadoPor", "name email")
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email")
      .populate("revisadoPor", "name email")
      .populate("activadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("aprobacionesPorPrograma.aprobadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email")
      .populate({
        path: "cierrePostulantesSeleccionados",
        populate: { path: "postulant", select: "postulantId", populate: { path: "postulantId", select: "name email" } },
      });

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const payload = opportunity.toObject ? opportunity.toObject() : { ...opportunity };
    // Si dedicacion viene como string (legacy), resolver a Item para que el front reciba objeto
    if (payload.dedicacion && typeof payload.dedicacion === "string") {
      const doc = await Item.findOne({
        listId: LIST_ID_DEDICATION_JOB_OFFER,
        $or: [
          { value: new RegExp(`^${escapeRegex(payload.dedicacion.trim())}$`, "i") },
          { description: new RegExp(`^${escapeRegex(payload.dedicacion.trim())}$`, "i") }
        ]
      }).select("_id value description").lean();
      if (doc) payload.dedicacion = doc;
    }
    // Si tipoVinculacion viene como string (legacy), resolver a Item
    if (payload.tipoVinculacion && typeof payload.tipoVinculacion === "string") {
      const doc = await Item.findOne({
        listId: LIST_ID_CONTRACT_TYPE_ACADEMIC_PRACTICE,
        $or: [
          { value: new RegExp(`^${escapeRegex(payload.tipoVinculacion.trim())}$`, "i") },
          { description: new RegExp(`^${escapeRegex(payload.tipoVinculacion.trim())}$`, "i") }
        ]
      }).select("_id value description").lean();
      if (doc) payload.tipoVinculacion = doc;
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nueva oportunidad
export const createOpportunity = async (req, res) => {
  try {
    // Manejar FormData: los datos vienen en req.body.data como string JSON
    let opportunityData = {};
    
    if (req.body.data) {
      // Si viene como FormData
      opportunityData = typeof req.body.data === 'string' 
        ? JSON.parse(req.body.data) 
        : req.body.data;
    } else {
      // Si viene como JSON directo
      opportunityData = req.body;
    }

    const { company, ...restData } = opportunityData;

    // Verificar que la empresa existe
    const companyExists = await Company.findById(company);
    if (!companyExists) {
      return res.status(400).json({ message: "Empresa no encontrada" });
    }

    // Validar campos requeridos
    if (!restData.nombreCargo) {
      return res.status(400).json({ message: "El nombre del cargo es requerido" });
    }

    if (!restData.requisitos) {
      return res.status(400).json({ message: "Los requisitos son requeridos" });
    }

    if (restData.funciones && restData.funciones.length < 60) {
      return res.status(400).json({ 
        message: "Las funciones deben tener al menos 60 caracteres" 
      });
    }

    await normalizeOpportunityRefs(restData);

    // Procesar documentos si vienen en FormData
    const documentos = [];
    if (req.files) {
      // Procesar archivos subidos
      let index = 1;
      while (req.files[`documento${index}`]) {
        const file = req.files[`documento${index}`][0] || req.files[`documento${index}`];
        const nombre = req.body[`documento${index}_nombre`] || file.originalname;
        const requerido = req.body[`documento${index}_requerido`] === 'true';
        const orden = parseInt(req.body[`documento${index}_orden`]) || index;

        documentos.push({
          nombre,
          archivo: {
            originalName: file.originalname,
            fileName: file.filename,
            path: file.path,
            size: file.size,
            mimeType: file.mimetype
          },
          requerido,
          orden
        });
        index++;
      }
    }

    // Crear la oportunidad con estado "Creada"
    const opportunity = await Opportunity.create({
      ...restData,
      company,
      documentos: documentos.length > 0 ? documentos : undefined,
      estado: "Creada",
      creadoPor: req.user.id,
      fechaCreacion: new Date(),
      historialEstados: [{
        estadoAnterior: null,
        estadoNuevo: "Creada",
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        comentarios: "Oportunidad creada"
      }]
    });

    await opportunity.populate("company", "name commercialName sector logo");
    await opportunity.populate("creadoPor", "name email");
    await opportunity.populate("tipoVinculacion", "value description listId");
    await opportunity.populate("historialEstados.cambiadoPor", "name email");

    res.status(201).json({
      message: "Oportunidad creada correctamente",
      opportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar oportunidad
export const updateOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validar que la oportunidad existe
    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Validar funciones si se actualizan
    if (updateData.funciones && updateData.funciones.length < 60) {
      return res.status(400).json({ 
        message: "Las funciones deben tener al menos 60 caracteres" 
      });
    }

    // No permitir cambiar el estado ni el historial desde el body
    if (updateData.estado) delete updateData.estado;
    if (updateData.historialEstados) delete updateData.historialEstados;

    await normalizeOpportunityRefs(updateData);

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("tipoVinculacion", "value description listId");

    // Registrar edición en historial de estados (mismo estado = edición)
    if (updatedOpportunity) {
      const historialEntry = {
        estadoAnterior: opportunity.estado,
        estadoNuevo: opportunity.estado,
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        comentarios: "Oportunidad editada"
      };
      updatedOpportunity.historialEstados.push(historialEntry);
      await updatedOpportunity.save();
    }

    const finalOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email")
      .populate("tipoVinculacion", "value description listId")
      .populate("historialEstados.cambiadoPor", "name email");

    res.json({
      message: "Oportunidad actualizada correctamente",
      opportunity: finalOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cambiar estado de la oportunidad
export const changeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentarios } = req.body;

    const validStates = [
      "Creada",
      "En Revisión",
      "Revisada",
      "Activa",
      "Rechazada",
      "Cerrada",
      "Vencida"
    ];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ 
        message: `Estado inválido. Estados válidos: ${validStates.join(", ")}` 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const estadoAnterior = opportunity.estado;

    // Actualizar estado y usuario correspondiente
    const updateData = {
      estado,
      comentariosRevision: comentarios || null
    };

    switch (estado) {
      case "En Revisión":
        updateData.revisadoPor = req.user.id;
        break;
      case "Activa":
        updateData.activadoPor = req.user.id;
        break;
      case "Rechazada":
        updateData.rechazadoPor = req.user.id;
        break;
    }

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Registrar en historial si cambió el estado
    if (estadoAnterior !== estado && updatedOpportunity) {
      const historialEntry = {
        estadoAnterior,
        estadoNuevo: estado,
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        comentarios: comentarios || null
      };
      
      updatedOpportunity.historialEstados.push(historialEntry);
      await updatedOpportunity.save();
    }

    const finalOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("revisadoPor", "name email")
      .populate("activadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email");

    res.json({
      message: `Estado cambiado a "${estado}" correctamente`,
      opportunity: finalOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** POST /opportunities/:id/close — Cerrar oportunidad (solo si está Activa). Body: contrató (boolean), motivoNoContrato? (string), postulantesSeleccionados? ([id]), datosTutor? ([{ postulacionId, nombreTutor, ... }]). */
export const closeOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const { contrató, motivoNoContrato, postulantesSeleccionados, datosTutor } = req.body;
    const contratoBool = contrató === true || contrató === "true" || contrató === 1 || contrató === "1";

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }
    if (opportunity.estado !== "Activa") {
      return res.status(400).json({ message: "Solo se puede cerrar una oportunidad en estado Activa" });
    }

    const seleccionados = Array.isArray(postulantesSeleccionados) ? postulantesSeleccionados : [];
    const tutores = Array.isArray(datosTutor) ? datosTutor : [];

    if (contratoBool) {
      if (seleccionados.length === 0) {
        return res.status(400).json({ message: "Debe seleccionar al menos un postulante cuando la entidad indica que contrató." });
      }

      const postulacionesValidas = await PostulacionOportunidad.find({
        _id: { $in: seleccionados },
        opportunity: id,
      }).select("_id").lean();
      if (postulacionesValidas.length !== seleccionados.length) {
        return res.status(400).json({ message: "Hay postulaciones seleccionadas que no pertenecen a esta oportunidad." });
      }

      const requiredTutorFields = [
        "nombreTutor",
        "apellidoTutor",
        "emailTutor",
        "cargoTutor",
        "tipoIdentTutor",
        "identificacionTutor",
        "arlEmpresa",
        "fechaInicioPractica",
      ];
      const tutorByPostulacion = new Map(
        tutores
          .filter((t) => t?.postulacionId)
          .map((t) => [String(t.postulacionId), t])
      );
      for (const postId of seleccionados.map(String)) {
        const tutor = tutorByPostulacion.get(postId);
        if (!tutor) {
          return res.status(400).json({ message: `Faltan datos del tutor para la postulación ${postId}.` });
        }
        for (const field of requiredTutorFields) {
          const value = tutor[field];
          if (value == null || String(value).trim() === "") {
            return res.status(400).json({ message: `El campo ${field} del tutor es obligatorio para la postulación ${postId}.` });
          }
        }
      }
    }

    const estadoAnterior = opportunity.estado;
    opportunity.estado = "Cerrada";
    opportunity.fechaCierre = new Date();
    opportunity.motivoCierreNoContrato = contratoBool ? null : ((motivoNoContrato || "").toString().trim() || null);
    opportunity.cierrePostulantesSeleccionados = seleccionados;
    opportunity.cierreDatosTutor = contratoBool ? tutores : [];

    if (opportunity.cierrePostulantesSeleccionados.length > 0) {
      await PostulacionOportunidad.updateMany(
        { _id: { $in: opportunity.cierrePostulantesSeleccionados }, opportunity: id },
        { $set: { estado: "seleccionado_empresa", seleccionadoAt: new Date() } }
      );
    }

    opportunity.historialEstados.push({
      estadoAnterior,
      estadoNuevo: "Cerrada",
      cambiadoPor: req.user.id,
      fechaCambio: new Date(),
      comentarios: contratoBool ? "Oportunidad cerrada con postulante(s) seleccionado(s)" : motivoNoContrato,
    });
    await opportunity.save();

    const updated = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("revisadoPor", "name email")
      .populate("activadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email");

    res.json({
      message: "Oportunidad cerrada correctamente",
      opportunity: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Rechazar oportunidad con motivo
export const rejectOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivoRechazo, motivoRechazoOtro } = req.body;

    if (!motivoRechazo) {
      return res.status(400).json({ 
        message: "Debe proporcionar un motivo de rechazo" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const estadoAnterior = opportunity.estado;

    // Actualizar oportunidad
    const updateData = {
      estado: "Rechazada",
      rechazadoPor: req.user.id,
      motivoRechazo,
      motivoRechazoOtro: motivoRechazo === "Otro" ? motivoRechazoOtro : null
    };

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Registrar en historial
    if (estadoAnterior !== "Rechazada" && updatedOpportunity) {
      const historialEntry = {
        estadoAnterior,
        estadoNuevo: "Rechazada",
        cambiadoPor: req.user.id,
        fechaCambio: new Date(),
        motivo: motivoRechazo,
        comentarios: motivoRechazo === "Otro" ? motivoRechazoOtro : motivoRechazo
      };
      
      updatedOpportunity.historialEstados.push(historialEntry);
      await updatedOpportunity.save();
    }

    const finalOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("rechazadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email");

    res.json({
      message: "Oportunidad rechazada correctamente",
      opportunity: finalOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener historial de estados
export const getStatusHistory = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("historialEstados.cambiadoPor", "name email")
      .select("historialEstados");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json({
      historial: opportunity.historialEstados || []
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Duplicar oportunidad
export const duplicateOpportunity = async (req, res) => {
  try {
    const originalOpportunity = await Opportunity.findById(req.params.id);
    
    if (!originalOpportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Crear nueva oportunidad con los mismos datos pero estado "Creada"
    const opportunityData = originalOpportunity.toObject();
    
    // Eliminar campos que no deben duplicarse
    delete opportunityData._id;
    delete opportunityData.createdAt;
    delete opportunityData.updatedAt;
    delete opportunityData.postulaciones;
    delete opportunityData.historialEstados;
    delete opportunityData.aprobacionesPorPrograma;
    delete opportunityData.revisadoPor;
    delete opportunityData.activadoPor;
    delete opportunityData.rechazadoPor;
    delete opportunityData.fechaRevision;
    delete opportunityData.fechaActivacion;
    delete opportunityData.fechaCierre;
    delete opportunityData.fechaVencimientoEstado;
    delete opportunityData.comentariosRevision;
    delete opportunityData.motivoRechazo;
    delete opportunityData.motivoRechazoOtro;

    // Establecer estado inicial e historial como "Creada" (igual que crear de cero)
    opportunityData.estado = "Creada";
    opportunityData.creadoPor = req.user.id;
    opportunityData.fechaCreacion = new Date();
    opportunityData.historialEstados = [{
      estadoAnterior: null,
      estadoNuevo: "Creada",
      cambiadoPor: req.user.id,
      fechaCambio: new Date(),
      comentarios: "Oportunidad creada"
    }];

    await normalizeOpportunityRefs(opportunityData);

    const newOpportunity = await Opportunity.create(opportunityData);

    await newOpportunity.populate("company", "name commercialName sector logo");
    await newOpportunity.populate("creadoPor", "name email");
    await newOpportunity.populate("historialEstados.cambiadoPor", "name email");

    res.status(201).json({
      message: "Oportunidad duplicada correctamente",
      opportunity: newOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar oportunidad
export const deleteOpportunity = async (req, res) => {
  try {
    const opportunity = await Opportunity.findByIdAndDelete(req.params.id);

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json({ message: "Oportunidad eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Postularse a oportunidad
export const applyToOpportunity = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentos } = req.body;

    // Verificar que la oportunidad existe
    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que esté activa
    if (opportunity.estado !== "Activa") {
      return res.status(400).json({ 
        message: "La oportunidad no está disponible para postulaciones" 
      });
    }

    // Verificar que no haya vencido
    if (opportunity.fechaVencimiento && new Date(opportunity.fechaVencimiento) < new Date()) {
      return res.status(400).json({ 
        message: "La oportunidad ha vencido" 
      });
    }

    // Verificar que el usuario es estudiante
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(400).json({ 
        message: "Solo los estudiantes pueden postularse" 
      });
    }

    // Verificar que no se haya postulado antes
    const existingApplication = opportunity.postulaciones.find(
      app => app.estudiante.toString() === student._id.toString()
    );

    if (existingApplication) {
      return res.status(400).json({ 
        message: "Ya te has postulado a esta oportunidad" 
      });
    }

    // Agregar postulación
    opportunity.postulaciones.push({
      estudiante: student._id,
      fechaPostulacion: new Date(),
      estado: "pendiente",
      documentos: documentos || []
    });

    await opportunity.save();

    const populatedOpportunity = await Opportunity.findById(id)
      .populate("postulaciones.estudiante", "studentId faculty program");

    res.status(201).json({
      message: "Postulación enviada correctamente",
      postulacion: populatedOpportunity.postulaciones[populatedOpportunity.postulaciones.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * RQ04_HU002: Postulante (estudiante) se postula a una oportunidad con una hoja de vida.
 * POST /opportunities/:id/aplicar — body: { profileId } (PostulantProfile._id), opcional { profileVersionId } (ProfileProfileVersion._id)
 */
export const aplicarOportunidad = async (req, res) => {
  try {
    const { id: opportunityId } = req.params;
    const { profileId, profileVersionId } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    if (!profileId) return res.status(400).json({ message: "Debe seleccionar un perfil (hoja de vida)" });

    const opportunity = await Opportunity.findById(opportunityId).lean();
    if (!opportunity) return res.status(404).json({ message: "Oportunidad no encontrada" });
    if (opportunity.estado !== "Activa") {
      return res.status(400).json({ message: "La oportunidad no está disponible para postulaciones" });
    }
    if (opportunity.fechaVencimiento && new Date(opportunity.fechaVencimiento) < new Date()) {
      return res.status(400).json({ message: "La oportunidad ha vencido" });
    }

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) {
      return res.status(400).json({ message: "No tiene un perfil de postulante asociado" });
    }

    // HU004: si ya tiene una postulación seleccionada por empresa o aceptada por estudiante,
    // se bloquean nuevas postulaciones hasta que rechace/culmine ese proceso.
    const tieneAprobadaVigente = await PostulacionOportunidad.exists({
      postulant: postulant._id,
      estado: { $in: ["seleccionado_empresa", "aceptado_estudiante"] },
    });
    if (tieneAprobadaVigente) {
      return res.status(400).json({
        message:
          "Ya tiene una postulación aprobada/seleccionada por una entidad. Debe responderla antes de postularse a más oportunidades.",
      });
    }

    const PostulantProfile = (await import("../postulants/models/profile/profile.schema.js")).default;
    const profile = await PostulantProfile.findOne({
      _id: profileId,
      $or: [{ postulantId: postulant._id }, { postulantId: userId }],
    }).select("_id").lean();
    if (!profile) {
      return res.status(400).json({ message: "El perfil seleccionado no existe o no le pertenece" });
    }

    let resolvedProfileVersionId = null;
    if (profileVersionId) {
      const { ProfileProfileVersion } = await import("../postulants/models/profile/index.js");
      const version = await ProfileProfileVersion.findOne({
        _id: profileVersionId,
        profileId: profile._id,
      }).select("_id").lean();
      if (!version) {
        return res.status(400).json({ message: "La versión de perfil no existe o no pertenece al perfil seleccionado" });
      }
      resolvedProfileVersionId = version._id;
    }

    const existing = await PostulacionOportunidad.findOne({
      opportunity: opportunityId,
      postulant: postulant._id,
    }).lean();
    if (existing) {
      return res.status(400).json({ message: "Ya se ha postulado a esta oportunidad" });
    }

    const postulacion = await PostulacionOportunidad.create({
      postulant: postulant._id,
      opportunity: opportunityId,
      postulantProfile: profileId,
      profileVersionId: resolvedProfileVersionId || undefined,
      estado: "aplicado",
    });

    const populated = await PostulacionOportunidad.findById(postulacion._id)
      .populate("opportunity", "nombreCargo company estado")
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode");

    res.status(201).json({
      message: "Postulación enviada correctamente",
      postulacion: populated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /opportunities/mis-postulaciones — Lista las postulaciones del estudiante (postulante) actual.
 */
export const getMisPostulaciones = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) {
      return res.json({ data: [], total: 0 });
    }

    const list = await PostulacionOportunidad.find({ postulant: postulant._id })
      .populate({
        path: "opportunity",
        select: "nombreCargo company periodo fechaVencimiento estado",
        populate: { path: "company", select: "name commercialName" },
      })
      .populate("postulantProfile", "studentCode")
      .sort({ fechaAplicacion: -1 })
      .lean();

    const tieneAceptadaDefinitiva = list.some((p) => p.estado === "aceptado_estudiante");

    const data = list.map((p) => {
      const opp = p.opportunity;
      const company = opp?.company;
      return {
        _id: p._id,
        cargo: opp?.nombreCargo,
        empresa: company?.name || company?.commercialName,
        fechaAplicacion: p.fechaAplicacion,
        estadoOportunidad: opp?.estado,
        estado: p.estado,
        empresaConsultoPerfil: !!p.empresaConsultoPerfilAt,
        empresaDescargoHv: !!p.empresaDescargoHvAt,
        seleccionadoPorEmpresa: p.estado === "seleccionado_empresa" || p.estado === "aceptado_estudiante",
        aceptadoPorEstudiante: p.estado === "aceptado_estudiante",
        puedeAceptarDefinitivo: p.estado === "seleccionado_empresa" && !tieneAceptadaDefinitiva,
        tieneAceptadaDefinitivaGlobal: tieneAceptadaDefinitiva,
        linkOportunidad: opp?._id ? `/dashboard/oportunidades-practica` : null,
        opportunityId: opp?._id,
      };
    });

    res.json({ data, total: data.length, tieneAceptadaDefinitivaGlobal: tieneAceptadaDefinitiva });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /opportunities/:id/applications/:postulacionId/estudiante-responder
 * El estudiante (postulante) confirma o rechaza la selección. Body: { accion: 'confirmar' | 'rechazar' }
 * Actualiza estado (aceptado_estudiante/rechazado) y aceptadoEstudianteAt/rechazadoAt.
 */
export const estudianteResponderPostulacion = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    const { id: opportunityId, postulacionId } = req.params;
    const { accion } = req.body || {};
    if (!accion || !["confirmar", "rechazar"].includes(accion)) {
      return res.status(400).json({ message: "accion debe ser 'confirmar' o 'rechazar'" });
    }

    const postulant = await Postulant.findOne({ postulantId: userId }).select("_id").lean();
    if (!postulant) return res.status(403).json({ message: "No es postulante" });

    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
      postulant: postulant._id,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    if (po.estado !== "seleccionado_empresa") {
      return res.status(400).json({ message: "Solo puede responder cuando fue seleccionado por la empresa" });
    }

    const now = new Date();
    if (accion === "confirmar") {
      const yaTieneAceptada = await PostulacionOportunidad.exists({
        postulant: postulant._id,
        estado: "aceptado_estudiante",
        _id: { $ne: po._id },
      });
      if (yaTieneAceptada) {
        return res.status(400).json({
          message: "Ya confirmó otra oportunidad. Solo puede aceptar una entidad definitivamente.",
        });
      }
      po.estado = "aceptado_estudiante";
      po.aceptadoEstudianteAt = now;
      po.rechazadoAt = null;
      po.comentarios = "Aceptada definitivamente por el estudiante";

      // HU004: al aceptar una, las demás postulaciones del estudiante pasan a no disponible (rechazadas).
      await PostulacionOportunidad.updateMany(
        {
          postulant: postulant._id,
          _id: { $ne: po._id },
          estado: { $in: ["aplicado", "empresa_consulto_perfil", "empresa_descargo_hv", "seleccionado_empresa"] },
        },
        {
          $set: {
            estado: "rechazado",
            rechazadoAt: now,
            comentarios: "No continúa el proceso: el estudiante aceptó otra oportunidad de forma definitiva",
            aceptadoEstudianteAt: null,
          },
        }
      );
    } else {
      po.estado = "rechazado";
      po.rechazadoAt = now;
      po.aceptadoEstudianteAt = null;
      po.comentarios = "Rechazada por el estudiante";
    }
    await po.save();

    // RQ04_HU006: Si el estudiante confirmó y la oportunidad es tipo "Acuerdo de vinculación", iniciar flujo de generación de acuerdo
    if (accion === "confirmar") {
      const opp = await Opportunity.findById(opportunityId).populate("tipoVinculacion", "value").lean();
      if (opp && esAcuerdoDeVinculacion(opp.tipoVinculacion)) {
        iniciarFlujoAcuerdoVinculacion(po._id.toString(), opportunityId, opp).catch((err) => {
          console.error("[RQ04_HU006] Error iniciando flujo acuerdo de vinculación:", err);
        });
      }
    }

    res.json({
      message: accion === "confirmar" ? "Has confirmado la selección" : "Has rechazado la selección",
      estado: po.estado,
      aceptadoEstudianteAt: po.aceptadoEstudianteAt,
      rechazadoAt: po.rechazadoAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /opportunities/:id/applications/:postulacionId/coord-aceptar
 * HU004: aceptación excepcional en nombre del estudiante por coordinación.
 */
export const coordinacionAceptarEnNombreEstudiante = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;

    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    });
    if (!po) return res.status(404).json({ message: "Postulación no encontrada" });
    if (po.estado !== "seleccionado_empresa") {
      return res.status(400).json({ message: "Solo se puede aceptar en nombre del estudiante cuando está seleccionada por la empresa" });
    }

    const now = new Date();
    const yaTieneAceptada = await PostulacionOportunidad.exists({
      postulant: po.postulant,
      estado: "aceptado_estudiante",
      _id: { $ne: po._id },
    });
    if (yaTieneAceptada) {
      return res.status(400).json({ message: "El estudiante ya tiene otra oportunidad aceptada definitivamente" });
    }

    po.estado = "aceptado_estudiante";
    po.aceptadoEstudianteAt = now;
    po.rechazadoAt = null;
    po.revisadoPor = req.user?.id || null;
    po.comentarios = "Aceptada en nombre del estudiante por coordinación";
    await po.save();

    await PostulacionOportunidad.updateMany(
      {
        postulant: po.postulant,
        _id: { $ne: po._id },
        estado: { $in: ["aplicado", "empresa_consulto_perfil", "empresa_descargo_hv", "seleccionado_empresa"] },
      },
      {
        $set: {
          estado: "rechazado",
          rechazadoAt: now,
          comentarios: "No continúa el proceso: coordinación confirmó otra oportunidad en nombre del estudiante",
          aceptadoEstudianteAt: null,
        },
      }
    );

    res.json({
      message: "Aceptación registrada en nombre del estudiante",
      estado: po.estado,
      aceptadoEstudianteAt: po.aceptadoEstudianteAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener postulaciones de una oportunidad (legacy Student + PostulacionOportunidad de postulantes)
export const getApplications = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate({
        path: "postulaciones.estudiante",
        select: "studentId faculty program user",
        populate: { path: "user", select: "name email" },
      })
      .populate("postulaciones.revisadoPor", "name email");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const postulantesList = await PostulacionOportunidad.find({ opportunity: req.params.id })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    const profileIds = postulantesList
      .map((p) => p.postulantProfile?._id)
      .filter(Boolean);

    const [enrolledByProfile, graduateByProfile] = await Promise.all([
      profileIds.length
        ? ProfileEnrolledProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
      profileIds.length
        ? ProfileGraduateProgram.find({ profileId: { $in: profileIds } })
            .populate("programId", "name level")
            .lean()
        : [],
    ]);

    const enrolledMap = new Map();
    enrolledByProfile.forEach((e) => {
      if (!e.profileId) return;
      const key = e.profileId.toString();
      if (!enrolledMap.has(key)) enrolledMap.set(key, []);
      enrolledMap.get(key).push(e.programId?.name || e.programId?.level || "—");
    });
    const graduateMap = new Map();
    graduateByProfile.forEach((g) => {
      if (!g.profileId) return;
      const key = g.profileId.toString();
      if (!graduateMap.has(key)) graduateMap.set(key, []);
      graduateMap.get(key).push(g.programId?.name || g.programId?.level || "—");
    });

    const estadoLabel = (est) => {
      const map = {
        aplicado: "Enviado",
        empresa_consulto_perfil: "Revisado",
        empresa_descargo_hv: "HV descargada",
        seleccionado_empresa: "Seleccionado",
        aceptado_estudiante: "Aceptado",
        rechazado: "Rechazado",
      };
      return map[est] || est || "—";
    };

    const postulacionesLegacy = (opportunity.postulaciones || []).map((p) => {
      const po = p.toObject?.() || p;
      const estudiante = po.estudiante || {};
      const name = estudiante.user?.name || estudiante.name || "";
      const [nombres = "", ...rest] = (name || "").trim().split(/\s+/);
      const apellidos = rest.join(" ") || "—";
      return {
        ...po,
        _source: "legacy",
        tipo: "student",
        nombres: nombres || "—",
        apellidos,
        programasEnCurso: estudiante.program ? [estudiante.program] : [],
        programasFinalizados: [],
        añosExperiencia: null,
        revisada: !!po.revisadoPor,
        descargada: false,
        estadoLabel: "Enviado",
      };
    });

    const postulacionesPostulantes = postulantesList.map((p) => {
      const profileId = p.postulantProfile?._id?.toString();
      const name = (p.postulant?.postulantId?.name || p.postulant?.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      const years = p.postulantProfile?.yearsExperience ?? p.postulantProfile?.totalTimeExperience;
      const añosExperiencia =
        years != null ? `${years} Año(s) de experiencia` : null;
      return {
        _id: p._id,
        postulant: p.postulant,
        postulantProfile: p.postulantProfile,
        fechaPostulacion: p.fechaAplicacion,
        estado: p.estado,
        estadoLabel: estadoLabel(p.estado),
        comentarios: p.comentarios,
        revisadoPor: p.revisadoPor,
        fechaRevision: p.updatedAt,
        _source: "postulacion_oportunidad",
        tipo: "postulant",
        nombres: nombres || "—",
        apellidos,
        programasEnCurso: profileId ? enrolledMap.get(profileId) || [] : [],
        programasFinalizados: profileId ? graduateMap.get(profileId) || [] : [],
        añosExperiencia,
        revisada: !!p.empresaConsultoPerfilAt,
        descargada: !!p.empresaDescargoHvAt,
      };
    });

    res.json({
      postulaciones: [...postulacionesLegacy, ...postulacionesPostulantes],
      total: postulacionesLegacy.length + postulacionesPostulantes.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /opportunities/:id/applications/detail/:postulacionId — Detalle de un postulante (perfil, competencias, CVs). Al entrar se marca empresa_consulto_perfil. */
export const getApplicationDetail = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    let po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    })
      .populate("postulant", "postulantId")
      .populate("postulantProfile", "studentCode yearsExperience totalTimeExperience")
      .populate({ path: "postulant", populate: { path: "postulantId", select: "name email" } })
      .lean();

    if (po) {
      if (po.estado === "aplicado" && !po.empresaConsultoPerfilAt) {
        await PostulacionOportunidad.updateOne(
          { _id: postulacionId },
          {
            $set: {
              estado: "empresa_consulto_perfil",
              empresaConsultoPerfilAt: new Date(),
            },
          }
        );
      }
      // Perfil (y versión) con el que se postuló: solo CVs de ESE perfil/versión
      const profileIdRaw = po.postulantProfile?._id ?? po.postulantProfile;
      const profileId = profileIdRaw
        ? mongoose.Types.ObjectId.isValid(profileIdRaw)
          ? typeof profileIdRaw === "string"
            ? new mongoose.Types.ObjectId(profileIdRaw)
            : profileIdRaw
          : null
        : null;
      const profileVersionIdRaw = po.profileVersionId;
      const profileVersionId = profileVersionIdRaw && mongoose.Types.ObjectId.isValid(profileVersionIdRaw)
        ? (typeof profileVersionIdRaw === "string" ? new mongoose.Types.ObjectId(profileVersionIdRaw) : profileVersionIdRaw)
        : null;
      // Solo la HV con la que aplicó: mismo perfil y misma versión (si aplicó con versión).
      const cvFilter = { profileId };
      if (profileVersionId) {
        cvFilter.profileVersionId = profileVersionId;
      } else {
        cvFilter.$or = [{ profileVersionId: null }, { profileVersionId: { $exists: false } }];
      }
      const postulantDocId = po.postulant?._id?.toString();
      const postulantDoc = postulantDocId
        ? await Postulant.findById(postulantDocId).select("_id phone alternateEmail linkedinLink").lean()
        : null;

      let cvs = [];
      if (profileId) {
        cvs = await ProfileCv.find(cvFilter)
          .populate("attachmentId", "name filepath contentType")
          .sort({ _id: -1 })
          .limit(1)
          .lean();
        if (cvs.length === 0 && !profileVersionId) {
          const fallback = await ProfileCv.find({ profileId }).populate("attachmentId", "name filepath contentType").sort({ _id: -1 }).limit(1).lean();
          if (fallback.length > 0) cvs = fallback;
        }
      }
      const [skills] = await Promise.all([
        profileId
          ? ProfileSkill.find({ profileId }).populate("skillId", "name").lean()
          : [],
      ]);

      const name = (po.postulant?.postulantId?.name || po.postulant?.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      const years = po.postulantProfile?.yearsExperience ?? po.postulantProfile?.totalTimeExperience;
      const añosExperiencia = years != null ? `${years} Año(s) de experiencia` : null;

      const [enrolledList, graduateList] = await Promise.all([
        profileId ? ProfileEnrolledProgram.find({ profileId }).populate("programId", "name level").lean() : [],
        profileId ? ProfileGraduateProgram.find({ profileId }).populate("programId", "name level").lean() : [],
      ]);

      res.json({
        _id: po._id,
        _source: "postulacion_oportunidad",
        nombres: nombres || "—",
        apellidos,
        email: po.postulant?.postulantId?.email || postulantDoc?.alternateEmail || "—",
        telefono: postulantDoc?.phone || "—",
        linkedin: postulantDoc?.linkedinLink || null,
        fechaAplicacion: po.fechaAplicacion,
        estado: po.estado,
        estadoLabel: { aplicado: "Enviado", empresa_consulto_perfil: "Revisado", empresa_descargo_hv: "HV descargada", seleccionado_empresa: "Seleccionado", aceptado_estudiante: "Aceptado", rechazado: "Rechazado" }[po.estado] || po.estado,
        programasEnCurso: enrolledList.map((e) => e.programId?.name || e.programId?.level || "—"),
        programasFinalizados: graduateList.map((g) => g.programId?.name || g.programId?.level || "—"),
        añosExperiencia,
        competencias: skills.map((s) => s.skillId?.name).filter(Boolean),
        hojasDeVida: cvs.map((c) => ({
          attachmentId: c.attachmentId?._id,
          name: c.attachmentId?.name || "Hoja de vida",
          postulantDocId: postulantDocId || postulantDoc?._id?.toString(),
        })),
      });
      return;
    }

    const oppWithLegacy = await Opportunity.findById(opportunityId)
      .populate({ path: "postulaciones.estudiante", select: "studentId faculty program user", populate: { path: "user", select: "name email" } })
      .lean();
    const legacy = (oppWithLegacy?.postulaciones || []).find(
      (p) => p._id && p._id.toString() === postulacionId
    );
    if (legacy) {
      const leg = legacy;
      const estudiante = leg.estudiante || {};
      const name = (estudiante.user?.name || estudiante.name || "").trim();
      const [nombres = "", ...rest] = name ? name.split(/\s+/) : [];
      const apellidos = rest.join(" ") || "—";
      res.json({
        _id: leg._id,
        _source: "legacy",
        nombres: nombres || "—",
        apellidos,
        email: estudiante.user?.email || "—",
        telefono: "—",
        linkedin: null,
        fechaAplicacion: leg.fechaPostulacion,
        estado: leg.estado,
        estadoLabel: "Enviado",
        programasEnCurso: estudiante.program ? [estudiante.program] : [],
        programasFinalizados: [],
        añosExperiencia: null,
        competencias: [],
        hojasDeVida: [],
      });
      return;
    }

    return res.status(404).json({ message: "Postulación no encontrada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** PATCH /opportunities/:id/applications/:postulacionId/state — Rechazar postulante o revertir rechazo (solo PostulacionOportunidad). */
export const updateApplicationState = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;
    const { estado, motivoNoAprobacion, motivo, comentarios } = req.body;

    if (!estado || !["rechazado", "empresa_consulto_perfil"].includes(estado)) {
      return res.status(400).json({
        message: "estado debe ser 'rechazado' o 'empresa_consulto_perfil' (para deshacer rechazo)",
      });
    }

    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    });
    if (!po) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    if (estado === "rechazado") {
      const razon = (motivoNoAprobacion ?? motivo ?? comentarios ?? "").toString().trim();
      if (!razon) {
        return res.status(400).json({
          message: "Debe indicar la razón de no aprobación para rechazar una postulación.",
        });
      }
      po.estado = "rechazado";
      po.rechazadoAt = new Date();
      po.comentarios = razon;
    } else {
      po.estado = "empresa_consulto_perfil";
      po.rechazadoAt = null;
    }
    await po.save();

    const estadoLabel = estado === "rechazado" ? "Rechazado" : "Revisado";
    res.json({
      message: estado === "rechazado" ? "Postulante rechazado" : "Rechazo revertido",
      estado: po.estado,
      estadoLabel,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** PATCH /opportunities/:id/applications/:postulacionId/descargo-hv — Marca que la empresa descargó la HV (empresaDescargoHvAt, estado empresa_descargo_hv). */
export const markApplicationDescargoHv = async (req, res) => {
  try {
    const { id: opportunityId, postulacionId } = req.params;
    const po = await PostulacionOportunidad.findOne({
      _id: postulacionId,
      opportunity: opportunityId,
    });
    if (!po) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }
    po.empresaDescargoHvAt = new Date();
    if (po.estado !== "empresa_descargo_hv") {
      po.estado = "empresa_descargo_hv";
    }
    await po.save();
    res.json({
      message: "HV marcada como descargada",
      empresaDescargoHvAt: po.empresaDescargoHvAt,
      estado: po.estado,
      estadoLabel: "HV descargada",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Revisar/Seleccionar postulación
export const reviewApplication = async (req, res) => {
  try {
    const { id, postulacionId } = req.params;
    const { estado, comentarios } = req.body;

    const validStates = ["pendiente", "en_revision", "seleccionado", "rechazado"];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ 
        message: `Estado inválido. Estados válidos: ${validStates.join(", ")}` 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    const postulacion = opportunity.postulaciones.id(postulacionId);
    if (!postulacion) {
      return res.status(404).json({ message: "Postulación no encontrada" });
    }

    postulacion.estado = estado;
    postulacion.comentarios = comentarios || null;
    postulacion.revisadoPor = req.user.id;
    postulacion.fechaRevision = new Date();

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email");

    res.json({
      message: `Postulación ${estado === "seleccionado" ? "seleccionada" : "actualizada"} correctamente`,
      postulacion: updatedOpportunity.postulaciones.id(postulacionId)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Seleccionar múltiples postulantes
export const selectMultipleApplications = async (req, res) => {
  try {
    const { id } = req.params;
    const { postulacionIds, comentarios } = req.body;

    if (!postulacionIds || !Array.isArray(postulacionIds) || postulacionIds.length === 0) {
      return res.status(400).json({ 
        message: "Debe proporcionar al menos un ID de postulación" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que no se exceda el número de vacantes
    const vacantesDisponibles = opportunity.vacantes || Infinity;
    const seleccionadosActuales = opportunity.postulaciones.filter(
      p => p.estado === "seleccionado"
    ).length;

    if (seleccionadosActuales + postulacionIds.length > vacantesDisponibles) {
      return res.status(400).json({ 
        message: `No se pueden seleccionar más postulantes. Vacantes disponibles: ${vacantesDisponibles - seleccionadosActuales}` 
      });
    }

    // Actualizar cada postulación
    postulacionIds.forEach(postulacionId => {
      const postulacion = opportunity.postulaciones.id(postulacionId);
      if (postulacion) {
        postulacion.estado = "seleccionado";
        postulacion.comentarios = comentarios || null;
        postulacion.revisadoPor = req.user.id;
        postulacion.fechaRevision = new Date();
      }
    });

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email");

    res.json({
      message: `${postulacionIds.length} postulante(s) seleccionado(s) correctamente`,
      opportunity: updatedOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Aprobar oportunidad por programa académico
export const approveProgram = async (req, res) => {
  try {
    const { id } = req.params;
    const { programa, comentarios } = req.body; // programa: { level, program }

    if (!programa || !programa.level || !programa.program) {
      return res.status(400).json({ 
        message: "Debe proporcionar el programa (level y program)" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que la oportunidad está en revisión
    if (opportunity.estado !== "En Revisión") {
      return res.status(400).json({ 
        message: "Solo se pueden aprobar programas cuando la oportunidad está en revisión" 
      });
    }

    // Buscar la aprobación del programa
    const aprobacionIndex = opportunity.aprobacionesPorPrograma.findIndex(
      ap => ap.programa.level === programa.level && ap.programa.program === programa.program
    );

    if (aprobacionIndex === -1) {
      return res.status(404).json({ 
        message: "Programa no encontrado en la formación académica de esta oportunidad" 
      });
    }

    // Actualizar la aprobación
    opportunity.aprobacionesPorPrograma[aprobacionIndex].estado = "aprobado";
    opportunity.aprobacionesPorPrograma[aprobacionIndex].aprobadoPor = req.user.id;
    opportunity.aprobacionesPorPrograma[aprobacionIndex].fechaAprobacion = new Date();
    opportunity.aprobacionesPorPrograma[aprobacionIndex].comentarios = comentarios || null;

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("aprobacionesPorPrograma.aprobadoPor", "name email")
      .populate("creadoPor", "name email");

    res.json({
      message: `Programa ${programa.program} aprobado correctamente`,
      opportunity: updatedOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Rechazar oportunidad por programa académico
export const rejectProgram = async (req, res) => {
  try {
    const { id } = req.params;
    const { programa, comentarios } = req.body; // programa: { level, program }

    if (!programa || !programa.level || !programa.program) {
      return res.status(400).json({ 
        message: "Debe proporcionar el programa (level y program)" 
      });
    }

    const opportunity = await Opportunity.findById(id);
    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    // Verificar que la oportunidad está en revisión
    if (opportunity.estado !== "En Revisión") {
      return res.status(400).json({ 
        message: "Solo se pueden rechazar programas cuando la oportunidad está en revisión" 
      });
    }

    // Buscar la aprobación del programa
    const aprobacionIndex = opportunity.aprobacionesPorPrograma.findIndex(
      ap => ap.programa.level === programa.level && ap.programa.program === programa.program
    );

    if (aprobacionIndex === -1) {
      return res.status(404).json({ 
        message: "Programa no encontrado en la formación académica de esta oportunidad" 
      });
    }

    // Actualizar la aprobación
    opportunity.aprobacionesPorPrograma[aprobacionIndex].estado = "rechazado";
    opportunity.aprobacionesPorPrograma[aprobacionIndex].aprobadoPor = req.user.id;
    opportunity.aprobacionesPorPrograma[aprobacionIndex].fechaAprobacion = new Date();
    opportunity.aprobacionesPorPrograma[aprobacionIndex].comentarios = comentarios || null;

    await opportunity.save();

    const updatedOpportunity = await Opportunity.findById(id)
      .populate("company", "name commercialName sector logo")
      .populate("aprobacionesPorPrograma.aprobadoPor", "name email")
      .populate("creadoPor", "name email");

    res.json({
      message: `Programa ${programa.program} rechazado correctamente`,
      opportunity: updatedOpportunity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};