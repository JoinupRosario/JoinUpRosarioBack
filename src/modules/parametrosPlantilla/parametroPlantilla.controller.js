import ParametroPlantilla from "./parametroPlantilla.model.js";

/**
 * GET /parametros-plantilla?tipo=practica|monitoria|general
 * Lista parámetros de plantilla filtrados por tipo.
 */
export const getParametrosPlantilla = async (req, res) => {
  try {
    const { tipo } = req.query;
    const filter = {};
    if (tipo && ["practica", "monitoria", "general"].includes(tipo)) {
      filter.tipo = tipo;
    }
    const list = await ParametroPlantilla.find(filter).sort({ value: 1 }).lean();
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
