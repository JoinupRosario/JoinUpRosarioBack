import NotificationVariable from "./variableNotificacion.model.js";

/**
 * GET /notificacion/variables
 * Lista todas las variables del catálogo (para selección en plantillas).
 */
export const getNotificationVariables = async (req, res) => {
  try {
    const { categoria } = req.query;
    const filter = {};
    if (categoria && String(categoria).trim()) {
      filter.categoria = String(categoria).trim();
    }
    const list = await NotificationVariable.find(filter)
      .sort({ categoria: 1, key: 1 })
      .lean();
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
