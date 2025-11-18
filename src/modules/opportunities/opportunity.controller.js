import Opportunity from "./opportunity.model.js";
import Company from "../companies/company.model.js";
import Student from "../students/student.model.js";

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
      .populate("postulaciones.estudiante", "studentId faculty program")
      .populate("revisadoPor", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort(sortOptions);

    const total = await Opportunity.countDocuments(filter);

    res.json({
      opportunities,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener oportunidad por ID
export const getOpportunityById = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("company", "name commercialName sector logo contact")
      .populate("creadoPor", "name email")
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email")
      .populate("revisadoPor", "name email")
      .populate("activadoPor", "name email")
      .populate("rechazadoPor", "name email")
      .populate("aprobacionesPorPrograma.aprobadoPor", "name email")
      .populate("historialEstados.cambiadoPor", "name email");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json(opportunity);
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

    // No permitir cambiar el estado directamente desde aquí (usar changeStatus)
    if (updateData.estado) {
      delete updateData.estado;
    }

    const updatedOpportunity = await Opportunity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("company", "name commercialName sector logo")
      .populate("creadoPor", "name email");

    res.json({
      message: "Oportunidad actualizada correctamente",
      opportunity: updatedOpportunity
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

    // Establecer estado inicial
    opportunityData.estado = "Creada";
    opportunityData.creadoPor = req.user.id;
    opportunityData.fechaCreacion = new Date();

    const newOpportunity = await Opportunity.create(opportunityData);

    await newOpportunity.populate("company", "name commercialName sector logo");
    await newOpportunity.populate("creadoPor", "name email");

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

// Obtener postulaciones de una oportunidad
export const getApplications = async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id)
      .populate("postulaciones.estudiante", "studentId faculty program user")
      .populate("postulaciones.revisadoPor", "name email");

    if (!opportunity) {
      return res.status(404).json({ message: "Oportunidad no encontrada" });
    }

    res.json({
      postulaciones: opportunity.postulaciones,
      total: opportunity.postulaciones.length
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