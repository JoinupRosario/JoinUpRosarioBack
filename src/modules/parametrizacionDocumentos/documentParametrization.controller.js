import DocumentParametrization from "./documentParametrization.schema.js";

const DOC_TYPE_HOJA_VIDA = "hoja_vida";
/** RQ04_HU003: Parametrización Carta de presentación */
const DOC_TYPE_CARTA_PRESENTACION = "carta_presentacion";
/** RQ04_HU006: Parametrización Acuerdo de vinculación laboral */
const DOC_TYPE_ACUERDO_VINCULACION = "acuerdo_vinculacion";

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

/**
 * GET /parametrizacion-documentos/carta-presentacion
 * RQ04_HU003: Devuelve la configuración de parametrización de la carta de presentación (logo, formato, campos obligatorios).
 */
export const getCartaPresentacionParametrization = async (req, res) => {
  try {
    let doc = await DocumentParametrization.findOne({ type: DOC_TYPE_CARTA_PRESENTACION }).lean();
    if (!doc) {
      return res.json({
        type: DOC_TYPE_CARTA_PRESENTACION,
        logoBase64: null,
        formatSecciones: [],
        camposObligatorios: {},
        firmaBase64: null,
        firmaDatos: { nombre: "", cargo: "", unidad: "" },
        bloquesTexto: [],
        textosInternos: { encabezado: "", cuerpo: "", cierre: "" },
        opcionFechaCarta: "fecha_actual",
      });
    }
    const firmaDatos = doc.firmaDatos && typeof doc.firmaDatos === "object"
      ? { nombre: doc.firmaDatos.nombre ?? "", cargo: doc.firmaDatos.cargo ?? "", unidad: doc.firmaDatos.unidad ?? "" }
      : { nombre: "", cargo: "", unidad: "" };
    const bloquesTexto = Array.isArray(doc.bloquesTexto) ? doc.bloquesTexto : [];
    const textosInternos = doc.textosInternos && typeof doc.textosInternos === "object"
      ? {
          encabezado: String(doc.textosInternos.encabezado ?? ""),
          cuerpo: String(doc.textosInternos.cuerpo ?? ""),
          cierre: String(doc.textosInternos.cierre ?? ""),
        }
      : { encabezado: "", cuerpo: "", cierre: "" };
    const opcionFechaCarta = ["fecha_actual", "fecha_elegible", "ninguna"].includes(doc.opcionFechaCarta)
      ? doc.opcionFechaCarta
      : "fecha_actual";
    res.json({
      type: doc.type,
      logoBase64: doc.logoBase64 ?? null,
      formatSecciones: doc.formatSecciones ?? [],
      camposObligatorios: doc.camposObligatorios ?? {},
      firmaBase64: doc.firmaBase64 ?? null,
      firmaDatos,
      bloquesTexto,
      textosInternos,
      opcionFechaCarta,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /parametrizacion-documentos/carta-presentacion
 * opcionFechaCarta: 'fecha_actual' | 'fecha_elegible' | 'ninguna'
 */
export const updateCartaPresentacionParametrization = async (req, res) => {
  try {
    const { logoBase64, formatSecciones, camposObligatorios, firmaBase64, firmaDatos, bloquesTexto, textosInternos, opcionFechaCarta } = req.body;
    const update = {};
    if (logoBase64 !== undefined) update.logoBase64 = logoBase64;
    if (Array.isArray(formatSecciones)) update.formatSecciones = formatSecciones;
    if (camposObligatorios !== undefined && typeof camposObligatorios === "object")
      update.camposObligatorios = camposObligatorios;
    if (firmaBase64 !== undefined) update.firmaBase64 = firmaBase64;
    if (firmaDatos !== undefined && typeof firmaDatos === "object") {
      update.firmaDatos = {
        nombre: String(firmaDatos.nombre ?? "").trim(),
        cargo: String(firmaDatos.cargo ?? "").trim(),
        unidad: String(firmaDatos.unidad ?? "").trim(),
      };
    }
    if (Array.isArray(bloquesTexto)) {
      update.bloquesTexto = bloquesTexto.map((b, i) => ({
        key: String(b.key ?? `bloque_${i}`).trim() || `bloque_${i}`,
        titulo: String(b.titulo ?? "").trim(),
        contenido: String(b.contenido ?? "").trim(),
        order: typeof b.order === "number" ? b.order : i + 1,
        visible: b.visible !== false,
      }));
    }
    if (textosInternos !== undefined && typeof textosInternos === "object") {
      update.textosInternos = {
        encabezado: String(textosInternos.encabezado ?? "").trim(),
        cuerpo: String(textosInternos.cuerpo ?? "").trim(),
        cierre: String(textosInternos.cierre ?? "").trim(),
      };
    }
    if (opcionFechaCarta !== undefined && ["fecha_actual", "fecha_elegible", "ninguna"].includes(opcionFechaCarta)) {
      update.opcionFechaCarta = opcionFechaCarta;
    }

    const doc = await DocumentParametrization.findOneAndUpdate(
      { type: DOC_TYPE_CARTA_PRESENTACION },
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    const outFirmaDatos = doc.firmaDatos && typeof doc.firmaDatos === "object"
      ? { nombre: doc.firmaDatos.nombre ?? "", cargo: doc.firmaDatos.cargo ?? "", unidad: doc.firmaDatos.unidad ?? "" }
      : { nombre: "", cargo: "", unidad: "" };
    const outBloquesTexto = Array.isArray(doc.bloquesTexto) ? doc.bloquesTexto : [];
    const outTextosInternos = doc.textosInternos && typeof doc.textosInternos === "object"
      ? { encabezado: doc.textosInternos.encabezado ?? "", cuerpo: doc.textosInternos.cuerpo ?? "", cierre: doc.textosInternos.cierre ?? "" }
      : { encabezado: "", cuerpo: "", cierre: "" };
    const outOpcionFecha = ["fecha_actual", "fecha_elegible", "ninguna"].includes(doc.opcionFechaCarta) ? doc.opcionFechaCarta : "fecha_actual";
    res.json({
      type: doc.type,
      logoBase64: doc.logoBase64 ?? null,
      formatSecciones: doc.formatSecciones ?? [],
      camposObligatorios: doc.camposObligatorios ?? {},
      firmaBase64: doc.firmaBase64 ?? null,
      firmaDatos: outFirmaDatos,
      bloquesTexto: outBloquesTexto,
      textosInternos: outTextosInternos,
      opcionFechaCarta: outOpcionFecha,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /parametrizacion-documentos/acuerdo-vinculacion
 * RQ04_HU006: Devuelve la configuración de parametrización del acuerdo de vinculación (plantilla PDF, textos legales).
 */
export const getAcuerdoVinculacionParametrization = async (req, res) => {
  try {
    const doc = await DocumentParametrization.findOne({ type: DOC_TYPE_ACUERDO_VINCULACION }).lean();
    if (!doc) {
      return res.json({
        type: DOC_TYPE_ACUERDO_VINCULACION,
        logoBase64: null,
        textosLegalesAcuerdo: null,
      });
    }
    res.json({
      type: doc.type,
      logoBase64: doc.logoBase64 ?? null,
      textosLegalesAcuerdo: doc.textosLegalesAcuerdo ?? null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /parametrizacion-documentos/acuerdo-vinculacion
 * Body: { logoBase64?, textosLegalesAcuerdo? }
 */
export const updateAcuerdoVinculacionParametrization = async (req, res) => {
  try {
    const { logoBase64, textosLegalesAcuerdo } = req.body;
    const update = {};
    if (logoBase64 !== undefined) update.logoBase64 = logoBase64;
    if (textosLegalesAcuerdo !== undefined) update.textosLegalesAcuerdo = textosLegalesAcuerdo;

    const doc = await DocumentParametrization.findOneAndUpdate(
      { type: DOC_TYPE_ACUERDO_VINCULACION },
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    res.json({
      type: doc.type,
      logoBase64: doc.logoBase64 ?? null,
      textosLegalesAcuerdo: doc.textosLegalesAcuerdo ?? null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /parametrizacion-documentos/acuerdo-vinculacion/preview
 * Genera un PDF de vista previa con datos de ejemplo y la config actual (logo + textos).
 * Body opcional: { logoBase64?, textosLegalesAcuerdo? } para previsualizar sin guardar.
 */
export const previewAcuerdoVinculacionPdf = async (req, res) => {
  try {
    const { buildAcuerdoVinculacionPdf } = await import("../../services/acuerdoVinculacionPdf.service.js");
    let logoBase64 = req.body?.logoBase64;
    let textosLegalesAcuerdo = req.body?.textosLegalesAcuerdo;
    if (logoBase64 === undefined || textosLegalesAcuerdo === undefined) {
      const doc = await DocumentParametrization.findOne({ type: DOC_TYPE_ACUERDO_VINCULACION }).lean();
      if (logoBase64 === undefined) logoBase64 = doc?.logoBase64 ?? null;
      if (textosLegalesAcuerdo === undefined) textosLegalesAcuerdo = doc?.textosLegalesAcuerdo ?? null;
    }
    const dummyData = {
      estudiante: {
        nombreApellidos: "Juan Pérez García",
        tipoDocumento: "C.C.",
        numeroDocumento: "1234567890",
        direccion: "KR 13 #33-01 de la ciudad de Bogotá D.C.",
        facultad: "Facultad de Jurisprudencia",
        programa: "Derecho",
        semestre: "2025-1",
        creditosAprobados: "85",
      },
      escenario: {
        nombreOrganizacion: "Empresa Ejemplo S.A.S.",
        tipoIdentificacion: "NIT",
        nit: "900123456-1",
        direccion: "Avenida cra9#115-30 de la ciudad de Bogotá D.C.",
        representanteLegalNombre: "María López",
        representanteTipoDoc: "C.C.",
        representanteNumeroDoc: "9876543210",
        tutorNombre: "Carlos Rodríguez",
        tutorTipoDoc: "C.C.",
        tutorNumeroDoc: "5555555555",
      },
      universidad: {
        tipoIdentificacion: "NIT",
        numeroIdentificacion: "890123456-1",
        direccion: "Calle 12 C número 6 - 25 de la ciudad de Bogotá D.C.",
        representanteNombre: "Universidad del Rosario",
        representanteTipoDoc: "C.C.",
        representanteNumeroDoc: "—",
        monitorNombre: "Ana Monitor",
        monitorTipoDoc: "C.C.",
        monitorNumeroDoc: "—",
      },
      practica: {
        fechaInicio: new Date("2025-02-01"),
        fechaFin: new Date("2025-06-30"),
        dedicacion: "Medio tiempo",
        horario: "Lunes a viernes 8:00 a 12:00",
        fechaEvaluacionParcial: new Date("2025-04-15"),
        fechaEvaluacionFinal: new Date("2025-06-30"),
        conAuxilio: true,
        valor: 1500000,
      },
      parametrizacion: { logoBase64: logoBase64 || null, textosLegalesAcuerdo: textosLegalesAcuerdo || null },
    };
    const pdfBuffer = await buildAcuerdoVinculacionPdf(dummyData);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="acuerdo-vinculacion-vista-previa.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
