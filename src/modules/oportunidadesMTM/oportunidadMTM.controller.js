import OportunidadMTM from "./oportunidadMTM.model.js";
import Item from "../shared/reference-data/models/item.schema.js"; // asegura registro del modelo "items"
import { buildSearchRegex } from "../../utils/searchUtils.js";

const POPULATE_FIELDS = [
  { path: "dedicacionHoras", select: "value description listId" },
  { path: "valorPorHora", select: "value description listId" },
  { path: "tipoVinculacion", select: "value description listId" },
  { path: "categoria", select: "value description listId" },
  { path: "periodo", select: "codigo tipo estado" },
  { path: "asignaturas", select: "nombreAsignatura codAsignatura periodo codDepto nombreDepartamento" },
  { path: "programas", select: "name code level labelLevel" },
  { path: "company", select: "name legalName nit" },
  { path: "creadoPor", select: "name email" },
  { path: "actualizadoPor", select: "name email" }
];

// ─── Listar oportunidades MTM ─────────────────────────────────────────────────
export const getOportunidadesMTM = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      estado,
      periodo,
      categoria
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};

    if (search) {
      filter.nombreCargo = buildSearchRegex(search);
    }
    if (estado) filter.estado = estado;
    if (periodo) filter.periodo = periodo;
    if (categoria) filter.categoria = categoria;

    const [total, data] = await Promise.all([
      OportunidadMTM.countDocuments(filter),
      OportunidadMTM.find(filter)
        .populate(POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
    ]);

    res.json({
      data,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("[MTM] getOportunidadesMTM:", err);
    res.status(500).json({ message: "Error al obtener oportunidades MTM" });
  }
};

// ─── Obtener una oportunidad MTM por ID ───────────────────────────────────────
export const getOportunidadMTMById = async (req, res) => {
  try {
    const op = await OportunidadMTM.findById(req.params.id).populate(POPULATE_FIELDS);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    res.json(op);
  } catch (err) {
    console.error("[MTM] getOportunidadMTMById:", err);
    res.status(500).json({ message: "Error al obtener la oportunidad MTM" });
  }
};

// ─── Crear oportunidad MTM ────────────────────────────────────────────────────
export const createOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      company,
      nombreCargo,
      dedicacionHoras,
      valorPorHora,
      tipoVinculacion,
      categoria,
      periodo,
      vacantes,
      fechaVencimiento,
      asignaturas,
      promedioMinimo,
      nombreProfesor,
      unidadAcademica,
      horario,
      grupo,
      programas,
      funciones,
      requisitos
    } = req.body;

    if (!nombreCargo) {
      return res.status(400).json({ message: "El nombre del cargo es requerido" });
    }
    if (asignaturas && asignaturas.length > 3) {
      return res.status(400).json({ message: "Se pueden seleccionar máximo 3 asignaturas" });
    }

    const nueva = await OportunidadMTM.create({
      company: company || null,
      nombreCargo,
      dedicacionHoras: dedicacionHoras || null,
      valorPorHora: valorPorHora || null,
      tipoVinculacion: tipoVinculacion || null,
      categoria: categoria || null,
      periodo: periodo || null,
      vacantes: vacantes || null,
      fechaVencimiento: fechaVencimiento || null,
      asignaturas: asignaturas || [],
      promedioMinimo: promedioMinimo ?? null,
      nombreProfesor: nombreProfesor || null,
      unidadAcademica: unidadAcademica || null,
      horario: horario || null,
      grupo: grupo || null,
      programas: programas || [],
      funciones: funciones || null,
      requisitos: requisitos || null,
      estado: "Borrador",
      creadoPor: userId || null,
      historialEstados: [
        {
          estadoAnterior: null,
          estadoNuevo: "Borrador",
          cambiadoPor: userId,
          motivo: "Creación"
        }
      ]
    });

    const populated = await nueva.populate(POPULATE_FIELDS);
    res.status(201).json(populated);
  } catch (err) {
    console.error("[MTM] createOportunidadMTM:", err);
    res.status(500).json({ message: "Error al crear la oportunidad MTM" });
  }
};

// ─── Actualizar oportunidad MTM ───────────────────────────────────────────────
export const updateOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const op = await OportunidadMTM.findById(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const {
      company,
      nombreCargo,
      dedicacionHoras,
      valorPorHora,
      tipoVinculacion,
      categoria,
      periodo,
      vacantes,
      fechaVencimiento,
      asignaturas,
      promedioMinimo,
      nombreProfesor,
      unidadAcademica,
      horario,
      grupo,
      programas,
      funciones,
      requisitos
    } = req.body;

    if (asignaturas && asignaturas.length > 3) {
      return res.status(400).json({ message: "Se pueden seleccionar máximo 3 asignaturas" });
    }

    Object.assign(op, {
      ...(company !== undefined && { company }),
      ...(nombreCargo !== undefined && { nombreCargo }),
      ...(dedicacionHoras !== undefined && { dedicacionHoras }),
      ...(valorPorHora !== undefined && { valorPorHora }),
      ...(tipoVinculacion !== undefined && { tipoVinculacion }),
      ...(categoria !== undefined && { categoria }),
      ...(periodo !== undefined && { periodo }),
      ...(vacantes !== undefined && { vacantes }),
      ...(fechaVencimiento !== undefined && { fechaVencimiento }),
      ...(asignaturas !== undefined && { asignaturas }),
      ...(promedioMinimo !== undefined && { promedioMinimo }),
      ...(nombreProfesor !== undefined && { nombreProfesor }),
      ...(unidadAcademica !== undefined && { unidadAcademica }),
      ...(horario !== undefined && { horario }),
      ...(grupo !== undefined && { grupo }),
      ...(programas !== undefined && { programas }),
      ...(funciones !== undefined && { funciones }),
      ...(requisitos !== undefined && { requisitos }),
      actualizadoPor: userId || null
    });

    await op.save();
    const populated = await op.populate(POPULATE_FIELDS);
    res.json(populated);
  } catch (err) {
    console.error("[MTM] updateOportunidadMTM:", err);
    res.status(500).json({ message: "Error al actualizar la oportunidad MTM" });
  }
};

// ─── Cambiar estado de oportunidad MTM ───────────────────────────────────────
export const changeStatusMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { estado, motivo } = req.body;

    const VALID_STATES = ["Borrador", "Activa", "Inactiva"];
    if (!VALID_STATES.includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const op = await OportunidadMTM.findById(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    op.historialEstados.push({
      estadoAnterior: op.estado,
      estadoNuevo: estado,
      cambiadoPor: userId,
      motivo: motivo || null
    });
    op.estado = estado;
    op.actualizadoPor = userId || null;
    await op.save();

    const populated = await op.populate(POPULATE_FIELDS);
    res.json(populated);
  } catch (err) {
    console.error("[MTM] changeStatusMTM:", err);
    res.status(500).json({ message: "Error al cambiar el estado" });
  }
};

// ─── Duplicar oportunidad MTM ─────────────────────────────────────────────────
export const duplicateOportunidadMTM = async (req, res) => {
  try {
    const userId = req.user?.id;
    const original = await OportunidadMTM.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });

    const { _id, createdAt, updatedAt, historialEstados, __v, ...rest } = original;

    const copia = await OportunidadMTM.create({
      ...rest,
      nombreCargo: `${rest.nombreCargo} (copia)`,
      estado: "Borrador",
      creadoPor: userId || null,
      actualizadoPor: null,
      historialEstados: [
        {
          estadoAnterior: null,
          estadoNuevo: "Borrador",
          cambiadoPor: userId,
          motivo: `Duplicado desde ${_id}`
        }
      ]
    });

    const populated = await copia.populate(POPULATE_FIELDS);
    res.status(201).json(populated);
  } catch (err) {
    console.error("[MTM] duplicateOportunidadMTM:", err);
    res.status(500).json({ message: "Error al duplicar la oportunidad MTM" });
  }
};

// ─── Eliminar oportunidad MTM ─────────────────────────────────────────────────
export const deleteOportunidadMTM = async (req, res) => {
  try {
    const op = await OportunidadMTM.findByIdAndDelete(req.params.id);
    if (!op) return res.status(404).json({ message: "Oportunidad MTM no encontrada" });
    res.json({ message: "Oportunidad MTM eliminada correctamente" });
  } catch (err) {
    console.error("[MTM] deleteOportunidadMTM:", err);
    res.status(500).json({ message: "Error al eliminar la oportunidad MTM" });
  }
};
