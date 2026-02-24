import DocumentParametrization from "./documentParametrization.schema.js";

const DOC_TYPE_HOJA_VIDA = "hoja_vida";

/**
 * GET /parametrizacion-documentos/hoja-vida
 * Devuelve la configuración de parametrización de la hoja de vida (logo, formato, campos obligatorios).
 */
export const getHojaVidaParametrization = async (req, res) => {
  try {
    let doc = await DocumentParametrization.findOne({ type: DOC_TYPE_HOJA_VIDA }).lean();
    if (!doc) {
      return res.json({
        type: DOC_TYPE_HOJA_VIDA,
        logoBase64: null,
        formatSecciones: [],
        camposObligatorios: {},
      });
    }
    res.json({
      type: doc.type,
      logoBase64: doc.logoBase64 ?? null,
      formatSecciones: doc.formatSecciones ?? [],
      camposObligatorios: doc.camposObligatorios ?? {},
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /parametrizacion-documentos/hoja-vida
 * Body: { logoBase64?, formatSecciones?, camposObligatorios? }
 * Guarda la parametrización (logo en base64, orden de secciones, campos obligatorios).
 */
export const updateHojaVidaParametrization = async (req, res) => {
  try {
    const { logoBase64, formatSecciones, camposObligatorios } = req.body;
    const update = {};
    if (logoBase64 !== undefined) update.logoBase64 = logoBase64;
    if (Array.isArray(formatSecciones)) update.formatSecciones = formatSecciones;
    if (camposObligatorios !== undefined && typeof camposObligatorios === "object")
      update.camposObligatorios = camposObligatorios;

    const doc = await DocumentParametrization.findOneAndUpdate(
      { type: DOC_TYPE_HOJA_VIDA },
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    res.json({
      type: doc.type,
      logoBase64: doc.logoBase64 ?? null,
      formatSecciones: doc.formatSecciones ?? [],
      camposObligatorios: doc.camposObligatorios ?? {},
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
