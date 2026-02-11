import Periodo from "./periodo.model.js";

/** Convierte valor a Date o null para el modelo. */
const toDateOrNull = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Normaliza el body para crear/actualizar: solo campos permitidos y fechas convertidas. */
const normalizePeriodoBody = (body) => {
  const raw = body || {};
  const dateRange = (inicio, fin) => ({
    inicio: toDateOrNull(inicio),
    fin: toDateOrNull(fin),
  });
  return {
    codigo: raw.codigo != null ? String(raw.codigo).trim() : undefined,
    estado: raw.estado != null ? String(raw.estado).trim() : undefined,
    fechaSistemaAcademico: raw.fechaSistemaAcademico != null
      ? dateRange(raw.fechaSistemaAcademico.inicio, raw.fechaSistemaAcademico.fin)
      : undefined,
    fechaInicioPractica: raw.fechaInicioPractica != null
      ? dateRange(raw.fechaInicioPractica.inicio, raw.fechaInicioPractica.fin)
      : undefined,
    fechaMaxFinPractica: toDateOrNull(raw.fechaMaxFinPractica),
    fechaAutorizacion: raw.fechaAutorizacion != null
      ? dateRange(raw.fechaAutorizacion.inicio, raw.fechaAutorizacion.fin)
      : undefined,
    fechaLegalizacion: raw.fechaLegalizacion != null
      ? dateRange(raw.fechaLegalizacion.inicio, raw.fechaLegalizacion.fin)
      : undefined,
    fechaPublicarOfertas: raw.fechaPublicarOfertas != null
      ? dateRange(raw.fechaPublicarOfertas.inicio, raw.fechaPublicarOfertas.fin)
      : undefined,
  };
};

/** Quita undefined para no pisar campos en update. */
const removeUndefined = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

/**
 * Lista períodos con paginación y búsqueda por código.
 * Query: page, limit, search (por codigo).
 */
export const getPeriodos = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (search && search.trim()) {
      filter.codigo = { $regex: search.trim(), $options: "i" };
    }
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Periodo.find(filter).sort({ codigo: -1 }).skip(skip).limit(limitNum).lean(),
      Periodo.countDocuments(filter),
    ]);

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

/**
 * Obtiene un período por ID.
 */
export const getPeriodoById = async (req, res) => {
  try {
    const periodo = await Periodo.findById(req.params.id).lean();
    if (!periodo) {
      return res.status(404).json({ message: "Período no encontrado" });
    }
    res.json(periodo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Crea un período. Body: codigo, estado, fechaSistemaAcademico, fechaInicioPractica,
 * fechaMaxFinPractica, fechaAutorizacion, fechaLegalizacion, fechaPublicarOfertas.
 */
export const createPeriodo = async (req, res) => {
  try {
    const body = normalizePeriodoBody(req.body);
    if (!body.codigo) {
      return res.status(400).json({ message: "El código del período es obligatorio." });
    }
    const payload = {
      codigo: body.codigo,
      estado: body.estado ?? "Inactivo",
      fechaSistemaAcademico: body.fechaSistemaAcademico ?? { inicio: null, fin: null },
      fechaInicioPractica: body.fechaInicioPractica ?? { inicio: null, fin: null },
      fechaMaxFinPractica: body.fechaMaxFinPractica ?? null,
      fechaAutorizacion: body.fechaAutorizacion ?? { inicio: null, fin: null },
      fechaLegalizacion: body.fechaLegalizacion ?? { inicio: null, fin: null },
      fechaPublicarOfertas: body.fechaPublicarOfertas ?? { inicio: null, fin: null },
    };
    const periodo = await Periodo.create(payload);
    res.status(201).json(periodo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * Actualiza un período por ID. Solo se actualizan los campos enviados (normalizados).
 */
export const updatePeriodo = async (req, res) => {
  try {
    const body = removeUndefined(normalizePeriodoBody(req.body));
    if (Object.keys(body).length === 0) {
      const periodo = await Periodo.findById(req.params.id).lean();
      if (!periodo) {
        return res.status(404).json({ message: "Período no encontrado" });
      }
      return res.json(periodo);
    }
    const periodo = await Periodo.findByIdAndUpdate(
      req.params.id,
      { $set: body },
      { new: true, runValidators: true }
    ).lean();
    if (!periodo) {
      return res.status(404).json({ message: "Período no encontrado" });
    }
    res.json(periodo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
