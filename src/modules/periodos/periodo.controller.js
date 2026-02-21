import Periodo from "./periodo.model.js";
import Log from "../logs/log.model.js";
import { logHelper } from "../logs/log.service.js";

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
  const tipo = raw.tipo === "monitoria" || raw.tipo === "practica" ? raw.tipo : undefined;
  return {
    tipo,
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
 * Query: page, limit, search (por codigo), tipo (practica | monitoria).
 */
export const getPeriodos = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, tipo, estado } = req.query;
    const filter = {};
    if (search && search.trim()) {
      filter.codigo = { $regex: search.trim(), $options: "i" };
    }
    if (tipo === "monitoria") {
      filter.tipo = "monitoria";
    } else if (tipo === "practica") {
      filter.$or = [{ tipo: "practica" }, { tipo: { $exists: false } }];
    }
    if (estado) {
      filter.estado = estado;
    }
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Periodo.find(filter)
        .sort({ codigo: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .lean(),
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
 * GET /periodos/:id/logs — Lista el log de actividades (quién creó, quién editó) del período.
 */
export const getPeriodoLogs = async (req, res) => {
  try {
    const periodo = await Periodo.findById(req.params.id).select("_id codigo tipo").lean();
    if (!periodo) {
      return res.status(404).json({ message: "Período no encontrado" });
    }
    const logs = await Log.find({ modulo: "periodos", entidadId: periodo._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("usuario", "name email")
      .lean();
    res.json({ periodo: { _id: periodo._id, codigo: periodo.codigo, tipo: periodo.tipo }, logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Obtiene un período por ID (con createdBy y updatedBy poblados).
 */
export const getPeriodoById = async (req, res) => {
  try {
    const periodo = await Periodo.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .lean();
    if (!periodo) {
      return res.status(404).json({ message: "Período no encontrado" });
    }
    res.json(periodo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Crea un período. Body: tipo (practica|monitoria), codigo, estado, fechaSistemaAcademico, ...
 * Para tipo monitoria solo se usan codigo, fechaSistemaAcademico, estado.
 */
export const createPeriodo = async (req, res) => {
  try {
    const body = normalizePeriodoBody(req.body);
    if (!body.codigo) {
      return res.status(400).json({ message: "El código del período es obligatorio." });
    }
    const tipo = body.tipo === "monitoria" ? "monitoria" : "practica";
    const userId = req.user?.id ?? req.user?._id ?? null;
    const payload = {
      tipo,
      codigo: body.codigo,
      estado: body.estado ?? "Inactivo",
      fechaSistemaAcademico: body.fechaSistemaAcademico ?? { inicio: null, fin: null },
      fechaInicioPractica: tipo === "practica" ? (body.fechaInicioPractica ?? { inicio: null, fin: null }) : { inicio: null, fin: null },
      fechaMaxFinPractica: tipo === "practica" ? body.fechaMaxFinPractica ?? null : null,
      fechaAutorizacion: tipo === "practica" ? (body.fechaAutorizacion ?? { inicio: null, fin: null }) : { inicio: null, fin: null },
      fechaLegalizacion: tipo === "practica" ? (body.fechaLegalizacion ?? { inicio: null, fin: null }) : { inicio: null, fin: null },
      fechaPublicarOfertas: tipo === "practica" ? (body.fechaPublicarOfertas ?? { inicio: null, fin: null }) : { inicio: null, fin: null },
      createdBy: userId,
      updatedBy: null,
    };
    const periodo = await Periodo.create(payload);
    const periodoLean = periodo.toObject ? periodo.toObject() : periodo;
    await logHelper.crear(
      req,
      "CREATE",
      "periodos",
      `Período creado: ${periodo.codigo} (tipo: ${tipo})`,
      periodo._id,
      null,
      { tipo: periodoLean.tipo, codigo: periodoLean.codigo, estado: periodoLean.estado, createdBy: userId },
      { tipo }
    );
    res.status(201).json(periodo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * Actualiza un período por ID. Solo se actualizan los campos enviados (normalizados).
 * Registra en log quién editó y datos antes/después.
 */
export const updatePeriodo = async (req, res) => {
  try {
    const body = removeUndefined(normalizePeriodoBody(req.body));
    const userId = req.user?.id ?? req.user?._id ?? null;
    const oldDoc = await Periodo.findById(req.params.id).lean();
    if (!oldDoc) {
      return res.status(404).json({ message: "Período no encontrado" });
    }
    if (Object.keys(body).length === 0) {
      return res.json(oldDoc);
    }
    const updateSet = { ...body, updatedBy: userId };
    const periodo = await Periodo.findByIdAndUpdate(
      req.params.id,
      { $set: updateSet },
      { new: true, runValidators: true }
    ).lean();
    if (!periodo) {
      return res.status(404).json({ message: "Período no encontrado" });
    }
    await logHelper.crear(
      req,
      "UPDATE",
      "periodos",
      `Período editado: ${periodo.codigo} (tipo: ${periodo.tipo ?? "practica"})`,
      periodo._id,
      { codigo: oldDoc.codigo, tipo: oldDoc.tipo, estado: oldDoc.estado },
      { codigo: periodo.codigo, tipo: periodo.tipo, estado: periodo.estado, updatedBy: userId },
      { tipo: periodo.tipo ?? "practica" }
    );
    res.json(periodo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
