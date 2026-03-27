import Evento from "./evento.model.js";

const TIPOS_EVENTO = ["practica", "monitoria", "general"];

/**
 * GET /notificacion/eventos?tipo=practica|monitoria|general
 * Varios tipos separados por coma, ej. practica,general
 */
export const getParametrosPlantilla = async (req, res) => {
  try {
    const { tipo } = req.query;
    const filter = {};
    if (tipo != null && String(tipo).trim() !== "") {
      const parts = String(tipo)
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const invalid = parts.filter((t) => !TIPOS_EVENTO.includes(t));
      if (invalid.length > 0) {
        return res.status(400).json({ message: `tipo inválido: ${invalid.join(", ")}` });
      }
      const unique = [...new Set(parts)];
      if (unique.length === 1) {
        filter.tipo = unique[0];
      } else if (unique.length > 1) {
        filter.tipo = { $in: unique };
      }
    }
    const list = await Evento.find(filter).sort({ tipo: 1, value: 1 }).lean();
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
