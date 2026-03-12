import PlantillaNotificacion from "./plantillaNotificacion.model.js";
import Evento from "../eventos/evento.model.js";
import NotificationVariable from "../variablesNotificacion/variableNotificacion.model.js";
import {
  validatePlantillaVariables,
  renderPlantilla,
} from "./plantillaNotificacion.utils.js";

/**
 * GET /notificacion/plantillas
 * Lista plantillas. Query: tipo=practica|monitoria|general, parametroPlantillaId=
 */
export const list = async (req, res) => {
  try {
    const { tipo, parametroPlantillaId } = req.query;
    const filter = {};

    if (parametroPlantillaId) {
      filter.parametroPlantillaId = parametroPlantillaId;
    } else if (tipo && ["practica", "monitoria", "general"].includes(tipo)) {
      const parametros = await Evento.find({ tipo }).select("_id").lean();
      filter.parametroPlantillaId = { $in: parametros.map((p) => p._id) };
    }

    const list = await PlantillaNotificacion.find(filter)
      .populate("parametroPlantillaId", "value tipo nombre variables")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /notificacion/plantillas/:id
 * Obtiene una plantilla por ID.
 */
export const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const plantilla = await PlantillaNotificacion.findById(id)
      .populate("parametroPlantillaId", "value tipo nombre variables")
      .lean();
    if (!plantilla) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }
    res.json({ data: plantilla });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /notificacion/plantillas/active/:parametroPlantillaId
 * Obtiene la plantilla activa para un evento (para ejecutar notificación).
 */
export const getActiveByParametro = async (req, res) => {
  try {
    const { parametroPlantillaId } = req.params;
    const plantilla = await PlantillaNotificacion.findOne({
      parametroPlantillaId,
      isActive: true,
    })
      .populate("parametroPlantillaId", "value tipo nombre")
      .lean();
    if (!plantilla) {
      return res.status(404).json({ message: "No hay plantilla activa para este evento" });
    }
    res.json({ data: plantilla });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /notificacion/plantillas/render/:id
 * Body: { datos: { NOMBRE_POSTULANTE: "...", ... } }
 * Devuelve { asunto, cuerpo } con variables reemplazadas (útil para pruebas).
 */
export const renderById = async (req, res) => {
  try {
    const { id } = req.params;
    const { datos = {} } = req.body;
    const plantilla = await PlantillaNotificacion.findById(id).lean();
    if (!plantilla) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }
    const rendered = renderPlantilla(plantilla.asunto, plantilla.cuerpo, datos);
    res.json({ data: rendered });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Actualiza las variables del evento (parametro_plantilla) a partir de selectedVariableKeys o variables.
 */
async function updateParametroVariablesFromPlantilla(parametroPlantillaId, selectedVariableKeys, variablesFromBody) {
  if (!parametroPlantillaId) return;
  let list = [];
  if (Array.isArray(variablesFromBody) && variablesFromBody.length > 0) {
    list = variablesFromBody.map((v) => ({
      variable: String(v.variable ?? v.key ?? "").trim(),
      desc: String(v.desc ?? v.label ?? "").trim(),
    })).filter((v) => v.variable.length > 0);
  } else if (Array.isArray(selectedVariableKeys) && selectedVariableKeys.length > 0) {
    const catalog = await NotificationVariable.find({}).select("key label").lean();
    const map = Object.fromEntries(catalog.map((c) => [String(c.key).toUpperCase(), c.label || c.key]));
    list = selectedVariableKeys.map((k) => ({
      variable: `[${String(k).toUpperCase()}]`,
      desc: map[String(k).toUpperCase()] || k,
    }));
  }
  if (list.length > 0) {
    await Evento.updateOne(
      { _id: parametroPlantillaId },
      { $set: { variables: list } }
    );
  }
}

/**
 * POST /notificacion/plantillas
 * Body: { parametroPlantillaId, asunto, cuerpo, frecuencia, isActive?, destinatarios?, selectedVariableKeys?, selectedVariables? }
 * Valida variables contra el catálogo. Si isActive=true, desactiva las demás del mismo evento.
 * Actualiza evento.variables con las variables seleccionadas.
 */
export const create = async (req, res) => {
  try {
    const { parametroPlantillaId, asunto, cuerpo, frecuencia, isActive, destinatarios, selectedVariableKeys, selectedVariables } = req.body;
    if (!parametroPlantillaId || !asunto || !asunto.trim()) {
      return res.status(400).json({ message: "Faltan parametroPlantillaId o asunto" });
    }

    const validKeys = await NotificationVariable.find({}).select("key").lean();
    const keys = validKeys.map((v) => v.key);
    const validation = validatePlantillaVariables(asunto, cuerpo || "", keys);
    if (!validation.valid) {
      return res.status(400).json({
        message: "Variables no válidas (no están en el catálogo)",
        invalidVariables: validation.invalidVariables,
      });
    }

    if (isActive === true) {
      await PlantillaNotificacion.updateMany(
        { parametroPlantillaId },
        { $set: { isActive: false } }
      );
    }

    const dest = Array.isArray(destinatarios)
      ? destinatarios.map((d) => String(d).toLowerCase().trim()).filter(Boolean)
      : [];
    const doc = await PlantillaNotificacion.create({
      parametroPlantillaId,
      asunto: asunto.trim(),
      cuerpo: (cuerpo || "").trim(),
      frecuencia: frecuencia || "inmediato",
      destinatarios: dest,
      isActive: isActive === true,
      createdBy: req.user?.id || null,
    });
    await updateParametroVariablesFromPlantilla(parametroPlantillaId, selectedVariableKeys, selectedVariables);
    const populated = await PlantillaNotificacion.findById(doc._id)
      .populate("parametroPlantillaId", "value tipo nombre")
      .lean();
    res.status(201).json({ data: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /notificacion/plantillas/:id
 * Body: { asunto?, cuerpo?, frecuencia?, isActive?, selectedVariableKeys?, selectedVariables? }
 * Valida variables si se envían asunto/cuerpo. Si isActive=true, desactiva las demás del mismo evento.
 */
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { asunto, cuerpo, frecuencia, isActive, destinatarios, selectedVariableKeys, selectedVariables } = req.body;
    const plantilla = await PlantillaNotificacion.findById(id);
    if (!plantilla) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    const finalAsunto = asunto !== undefined ? asunto : plantilla.asunto;
    const finalCuerpo = cuerpo !== undefined ? cuerpo : plantilla.cuerpo;
    const validKeys = await NotificationVariable.find({}).select("key").lean();
    const keys = validKeys.map((v) => v.key);
    const validation = validatePlantillaVariables(finalAsunto, finalCuerpo, keys);
    if (!validation.valid) {
      return res.status(400).json({
        message: "Variables no válidas (no están en el catálogo)",
        invalidVariables: validation.invalidVariables,
      });
    }

    if (asunto !== undefined) plantilla.asunto = asunto.trim();
    if (cuerpo !== undefined) plantilla.cuerpo = (cuerpo || "").trim();
    if (frecuencia !== undefined) plantilla.frecuencia = frecuencia;
    if (destinatarios !== undefined) {
      plantilla.destinatarios = Array.isArray(destinatarios)
        ? destinatarios.map((d) => String(d).toLowerCase().trim()).filter(Boolean)
        : [];
    }
    if (isActive === true) {
      await PlantillaNotificacion.updateMany(
        { parametroPlantillaId: plantilla.parametroPlantillaId, _id: { $ne: id } },
        { $set: { isActive: false } }
      );
      plantilla.isActive = true;
    } else if (isActive === false) {
      plantilla.isActive = false;
    }
    await plantilla.save();
    const populated = await PlantillaNotificacion.findById(plantilla._id)
      .populate("parametroPlantillaId", "value tipo nombre")
      .lean();
    res.json({ data: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /notificacion/plantillas/:id
 */
export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PlantillaNotificacion.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }
    res.json({ message: "Plantilla eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
