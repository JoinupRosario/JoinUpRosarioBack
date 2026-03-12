import DestinatarioNotificacion from "./destinatarioNotificacion.model.js";

/**
 * GET /notificacion/destinatarios
 * Lista todos los destinatarios posibles (para multi-select en plantillas).
 */
export const getDestinatariosNotificacion = async (req, res) => {
  try {
    const list = await DestinatarioNotificacion.find({})
      .sort({ orden: 1, label: 1 })
      .lean();
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
