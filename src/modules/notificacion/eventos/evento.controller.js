import Evento from "./evento.model.js";

/**
 * GET /notificacion/eventos?tipo=practica|monitoria|general
 * Lista eventos de notificación filtrados por tipo.
 */
export const getParametrosPlantilla = async (req, res) => {
  try {
    const { tipo } = req.query;
    const filter = {};
    if (tipo && ["practica", "monitoria", "general"].includes(tipo)) {
      filter.tipo = tipo;
    }
    const list = await Evento.find(filter).sort({ value: 1 }).lean();
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /notificacion/eventos/:id/variables
 * Actualiza las variables del evento (se usa al guardar una plantilla).
 * Body: { variables: [{ variable: "[KEY]", desc: "Label" }, ...] }
 */
export const updateParametroVariables = async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;
    const parametro = await Evento.findById(id);
    if (!parametro) {
      return res.status(404).json({ message: "Evento no encontrado" });
    }
    const list = Array.isArray(variables)
      ? variables.map((v) => ({
          variable: String(v.variable ?? v.key ?? "").trim(),
          desc: String(v.desc ?? v.label ?? "").trim(),
        })).filter((v) => v.variable.length > 0)
      : [];
    parametro.variables = list;
    await parametro.save();
    const updated = await Evento.findById(id).lean();
    res.json({ data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
