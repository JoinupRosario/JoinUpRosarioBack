import mongoose from "mongoose";

import SurveyMTM from "./surveyMTM.model.js";
import EvaluacionMTM from "./evaluacionMTM.model.js";
import EvaluacionAccessToken from "./evaluacionAccessToken.model.js";
import RespuestaEvaluacionMTM from "./respuestaEvaluacionMTM.model.js";
import LegalizacionMTM from "../oportunidadesMTM/legalizacionMTM.model.js";

import {
  dispararEvaluacionParaLegalizacion,
  reenviarCorreoToken,
} from "./evaluacionMTM.service.js";

/**
 * Controller autenticado del módulo de evaluación MTM (RQ04_HU011).
 * - Coordinador general: CRUD de SurveyMTM (plantillas y activación).
 * - Coordinador GuiARTE: ver evaluaciones, respuestas, reenviar correos, disparar manualmente.
 */

function isObjectId(id) {
  return id && mongoose.Types.ObjectId.isValid(String(id));
}

// ────────────────── Surveys (plantillas) ──────────────────

export const listSurveys = async (_req, res) => {
  try {
    const surveys = await SurveyMTM.find({})
      .select("nombre descripcion estado activadaAt updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ items: surveys });
  } catch (err) {
    console.error("[evaluacionMTM] listSurveys:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getSurveyById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "ID inválido" });
    const survey = await SurveyMTM.findById(id).lean();
    if (!survey) return res.status(404).json({ message: "Survey no encontrada" });
    res.json({ survey });
  } catch (err) {
    console.error("[evaluacionMTM] getSurveyById:", err);
    res.status(500).json({ message: err.message });
  }
};

export const createSurvey = async (req, res) => {
  try {
    const { nombre, descripcion, monitor_form, student_form, teacher_form } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }
    const survey = await SurveyMTM.create({
      nombre: String(nombre).trim(),
      descripcion: descripcion || "",
      monitor_form: monitor_form || { preguntas: [] },
      student_form: student_form || { preguntas: [] },
      teacher_form: teacher_form || { preguntas: [] },
      estado: "borrador",
      creadoPor: req.user?.id || null,
      actualizadoPor: req.user?.id || null,
    });
    res.status(201).json({ survey });
  } catch (err) {
    console.error("[evaluacionMTM] createSurvey:", err);
    res.status(500).json({ message: err.message });
  }
};

export const updateSurvey = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "ID inválido" });
    const survey = await SurveyMTM.findById(id);
    if (!survey) return res.status(404).json({ message: "Survey no encontrada" });
    if (survey.estado === "archivada") {
      return res.status(400).json({ message: "No se puede editar una survey archivada" });
    }
    const { nombre, descripcion, monitor_form, student_form, teacher_form } = req.body || {};
    if (nombre != null) survey.nombre = String(nombre).trim();
    if (descripcion != null) survey.descripcion = descripcion;
    if (monitor_form) survey.monitor_form = monitor_form;
    if (student_form) survey.student_form = student_form;
    if (teacher_form) survey.teacher_form = teacher_form;
    survey.actualizadoPor = req.user?.id || survey.actualizadoPor;
    await survey.save();
    res.json({ survey });
  } catch (err) {
    console.error("[evaluacionMTM] updateSurvey:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Activa una survey y desactiva la activa anterior (regla: una sola global).
 */
export const activateSurvey = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "ID inválido" });
    const survey = await SurveyMTM.findById(id);
    if (!survey) return res.status(404).json({ message: "Survey no encontrada" });
    if (survey.estado === "archivada") {
      return res.status(400).json({ message: "No se puede activar una survey archivada" });
    }

    await SurveyMTM.updateMany({ estado: "activa" }, { $set: { estado: "borrador" } });
    survey.estado = "activa";
    survey.activadaAt = new Date();
    survey.actualizadoPor = req.user?.id || survey.actualizadoPor;
    await survey.save();
    res.json({ survey, message: "Survey activada" });
  } catch (err) {
    console.error("[evaluacionMTM] activateSurvey:", err);
    res.status(500).json({ message: err.message });
  }
};

export const archiveSurvey = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "ID inválido" });
    const survey = await SurveyMTM.findById(id);
    if (!survey) return res.status(404).json({ message: "Survey no encontrada" });
    survey.estado = "archivada";
    survey.actualizadoPor = req.user?.id || survey.actualizadoPor;
    await survey.save();
    res.json({ survey, message: "Survey archivada" });
  } catch (err) {
    console.error("[evaluacionMTM] archiveSurvey:", err);
    res.status(500).json({ message: err.message });
  }
};

// ────────────────── Evaluaciones (admin) ──────────────────

export const listEvaluaciones = async (req, res) => {
  try {
    const { estado, oportunidadId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    if (oportunidadId && isObjectId(oportunidadId)) {
      filter.oportunidadMTM = new mongoose.Types.ObjectId(String(oportunidadId));
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

    const [items, total] = await Promise.all([
      EvaluacionMTM.find(filter)
        .populate({ path: "oportunidadMTM", select: "nombreCargo periodo", populate: { path: "periodo", select: "codigo" } })
        .populate({
          path: "postulacionMTM",
          select: "postulant",
          populate: { path: "postulant", populate: { path: "postulantId", select: "name email" } },
        })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * lim)
        .limit(lim)
        .lean(),
      EvaluacionMTM.countDocuments(filter),
    ]);

    res.json({ items, total, page: pageNum, limit: lim });
  } catch (err) {
    console.error("[evaluacionMTM] listEvaluaciones:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getEvaluacionDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "ID inválido" });
    const evaluacion = await EvaluacionMTM.findById(id)
      .populate({ path: "oportunidadMTM", select: "nombreCargo periodo", populate: { path: "periodo", select: "codigo" } })
      .populate({
        path: "postulacionMTM",
        select: "postulant",
        populate: { path: "postulant", populate: { path: "postulantId", select: "name email" } },
      })
      .lean();
    if (!evaluacion) return res.status(404).json({ message: "Evaluación no encontrada" });

    const tokens = await EvaluacionAccessToken.find({ evaluacionMTM: id })
      .sort({ actor: 1, nombreActor: 1 })
      .lean();
    const respuestas = await RespuestaEvaluacionMTM.find({ evaluacionMTM: id })
      .select("actor identificadorActor nombreActor email puntajePonderado completadaAt")
      .lean();

    res.json({ evaluacion, tokens, respuestas });
  } catch (err) {
    console.error("[evaluacionMTM] getEvaluacionDetalle:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /evaluaciones-mtm/evaluaciones/legalizacion/:legalizacionId
 * Devuelve el detalle de la EvaluacionMTM asociada a una legalización
 * (o `{ evaluacion: null }` si aún no se ha disparado).
 *
 * Sirve para mostrar el estado de la autoevaluación / respuestas directamente
 * desde la pantalla admin de revisión de legalización (RQ04_HU011).
 */
export const getEvaluacionDetalleByLegalizacion = async (req, res) => {
  try {
    const { legalizacionId } = req.params;
    if (!isObjectId(legalizacionId)) return res.status(400).json({ message: "ID inválido" });

    const evaluacion = await EvaluacionMTM.findOne({ legalizacionMTM: legalizacionId })
      .populate({ path: "oportunidadMTM", select: "nombreCargo periodo", populate: { path: "periodo", select: "codigo" } })
      .populate({
        path: "postulacionMTM",
        select: "postulant",
        populate: { path: "postulant", populate: { path: "postulantId", select: "name email" } },
      })
      .lean();
    if (!evaluacion) {
      return res.json({ evaluacion: null, tokens: [], respuestas: [] });
    }

    const tokens = await EvaluacionAccessToken.find({ evaluacionMTM: evaluacion._id })
      .sort({ actor: 1, nombreActor: 1 })
      .lean();
    const respuestas = await RespuestaEvaluacionMTM.find({ evaluacionMTM: evaluacion._id })
      .select("actor identificadorActor nombreActor email puntajePonderado completadaAt")
      .lean();

    res.json({ evaluacion, tokens, respuestas });
  } catch (err) {
    console.error("[evaluacionMTM] getEvaluacionDetalleByLegalizacion:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getRespuestaDetalle = async (req, res) => {
  try {
    const { respuestaId } = req.params;
    if (!isObjectId(respuestaId)) return res.status(400).json({ message: "ID inválido" });
    const respuesta = await RespuestaEvaluacionMTM.findById(respuestaId).lean();
    if (!respuesta) return res.status(404).json({ message: "Respuesta no encontrada" });
    res.json({ respuesta });
  } catch (err) {
    console.error("[evaluacionMTM] getRespuestaDetalle:", err);
    res.status(500).json({ message: err.message });
  }
};

export const reenviarToken = async (req, res) => {
  try {
    const { tokenId } = req.params;
    if (!isObjectId(tokenId)) return res.status(400).json({ message: "ID inválido" });
    const token = await reenviarCorreoToken(tokenId);
    res.json({ token, message: "Correo reenviado" });
  } catch (err) {
    if (err.code === "TOKEN_USADO") return res.status(409).json({ message: err.message });
    if (err.code === "SIN_EMAIL") return res.status(400).json({ message: err.message });
    if (err.code === "NOT_FOUND") return res.status(404).json({ message: err.message });
    console.error("[evaluacionMTM] reenviarToken:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Disparo manual desde panel administrativo (caso excepcional).
 * Por defecto el disparo lo realiza el endpoint `solicitarFinalizacionMTM` del módulo MTM.
 */
export const dispararEvaluacionAdmin = async (req, res) => {
  try {
    const { legalizacionId } = req.params;
    if (!isObjectId(legalizacionId)) return res.status(400).json({ message: "ID inválido" });
    const legalizacion = await LegalizacionMTM.findById(legalizacionId);
    if (!legalizacion) return res.status(404).json({ message: "Legalización no encontrada" });
    const result = await dispararEvaluacionParaLegalizacion({
      legalizacion,
      disparadaPor: req.user?.id || null,
    });
    res.json(result);
  } catch (err) {
    console.error("[evaluacionMTM] dispararEvaluacionAdmin:", err);
    res.status(500).json({ message: err.message });
  }
};

// ────────────────── Reportes ──────────────────

/**
 * Resumen agregado por oportunidad/legalización: cuántas completas, parciales,
 * promedio ponderado por actor.
 */
export const getReporteEvaluaciones = async (req, res) => {
  try {
    const { oportunidadId } = req.query;
    const match = {};
    if (oportunidadId && isObjectId(oportunidadId)) {
      match.oportunidadMTM = new mongoose.Types.ObjectId(String(oportunidadId));
    }

    const evaluaciones = await EvaluacionMTM.find(match)
      .select("_id estado totalEstudiantesEsperados totalEstudiantesRespondidos monitorRespondidoAt profesorRespondidoAt oportunidadMTM")
      .populate({ path: "oportunidadMTM", select: "nombreCargo" })
      .lean();

    const ids = evaluaciones.map((e) => e._id);
    const promedios = await RespuestaEvaluacionMTM.aggregate([
      { $match: { evaluacionMTM: { $in: ids }, puntajePonderado: { $ne: null } } },
      {
        $group: {
          _id: { evaluacion: "$evaluacionMTM", actor: "$actor" },
          promedio: { $avg: "$puntajePonderado" },
          n: { $sum: 1 },
        },
      },
    ]);

    const promediosByEval = new Map();
    for (const p of promedios) {
      const key = String(p._id.evaluacion);
      if (!promediosByEval.has(key)) promediosByEval.set(key, {});
      promediosByEval.get(key)[p._id.actor] = {
        promedio: Number(p.promedio?.toFixed?.(2) ?? p.promedio),
        n: p.n,
      };
    }

    const items = evaluaciones.map((e) => ({
      _id: e._id,
      oportunidad: e.oportunidadMTM?.nombreCargo || "",
      estado: e.estado,
      monitorRespondido: Boolean(e.monitorRespondidoAt),
      profesorRespondido: Boolean(e.profesorRespondidoAt),
      estudiantesEsperados: e.totalEstudiantesEsperados || 0,
      estudiantesRespondidos: e.totalEstudiantesRespondidos || 0,
      promedios: promediosByEval.get(String(e._id)) || {},
    }));

    res.json({ items, total: items.length });
  } catch (err) {
    console.error("[evaluacionMTM] getReporteEvaluaciones:", err);
    res.status(500).json({ message: err.message });
  }
};
