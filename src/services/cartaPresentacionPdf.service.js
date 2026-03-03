/**
 * Genera el PDF de la carta de presentación según parametrización.
 * Variables: [FECHA], [NOMBRE_COMPLETO], [NUMERO_DOCUMENTO], [NOMBRE_PROGRAMA], [CREDITOS_CURSADOS], [CREDITOS_TOTAL], [PROMEDIO], [NOMBRE_EMPRESA], [CIUDAD_EMPRESA]
 */
import PDFDocument from "pdfkit";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Márgenes amplios en laterales para formato de carta formal (bloque de texto más estrecho, más espacio a los lados) */
const MARGIN = 72;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LOGO_WIDTH = 120;
const LOGO_HEIGHT = 48;
const FIRMA_MAX_WIDTH = 100;
const FIRMA_MAX_HEIGHT = 40;
const FONT_SIZE_BODY = 9;
const FONT_SIZE_FIRMA = 9;
const LINE_GAP = 2;
const COLOR_BODY = "#1a1a1a";
const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

function safeStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

/** Buffer de imagen desde base64 (data URL o raw). Convierte SVG a PNG. */
async function getImageBuffer(base64, maxW = LOGO_WIDTH, maxH = LOGO_HEIGHT) {
  if (!base64 || typeof base64 !== "string") return null;
  const trimmed = base64.trim();
  const isSvgDataUrl = trimmed.startsWith("data:image/svg");
  const isRawSvg = trimmed.startsWith("<svg");
  if (isSvgDataUrl || isRawSvg) {
    try {
      const base64Part = isSvgDataUrl ? trimmed.split(",")[1] : null;
      const svgBuffer = base64Part ? Buffer.from(base64Part, "base64") : Buffer.from(trimmed, "utf8");
      return await sharp(svgBuffer)
        .resize(maxW * 2, maxH * 2, { fit: "inside", withoutEnlargement: false })
        .png()
        .toBuffer();
    } catch (e) {
      console.warn("[cartaPresentacionPdf] SVG to PNG:", e.message);
      return null;
    }
  }
  const base64Data = trimmed.includes(",") ? trimmed.split(",")[1] : trimmed;
  if (!base64Data) return null;
  try {
    return Buffer.from(base64Data, "base64");
  } catch (e) {
    return null;
  }
}

function formatFechaActual() {
  return new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Encabezado: solo dos ajustes para no interferir con el texto.
 * - Salto de línea después de "Señores".
 * - Doble salto antes de "Asunto:".
 * El resto (empresa, ciudad) debe llevar saltos en el texto de parametrización.
 */
function normalizeEncabezadoSaltos(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/Señores\s*/gi, "Señores\n")
    .replace(/\n(Asunto\s*:)/gi, "\n\n$1");
}

/**
 * Reemplaza variables en un texto.
 * @param {string} text
 * @param {Record<string, string>} vars
 */
function replaceVars(text, vars) {
  if (!text || typeof text !== "string") return "";
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\[${key}\\]`, "gi");
    out = out.replace(placeholder, value);
  }
  return out;
}

/**
 * Divide el texto en segmentos: lo que está entre * o ** se marca como bold.
 * Ej: "Hola *mundo* cruel" o "Hola **mundo** cruel" -> segmento "mundo" en negrita.
 */
function parseBoldSegments(text) {
  if (!text || typeof text !== "string") return [];
  const parts = text.split(/\*+(.*?)\*+/g);
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (s === "") continue;
    segments.push({ text: s, bold: i % 2 === 1 });
  }
  if (segments.length === 0 && text.length > 0) segments.push({ text, bold: false });
  return segments;
}

/**
 * Dibuja texto con negrita (*texto* o **texto**). Tamaño y fuente se fijan en cada segmento.
 */
function drawTextWithBold(doc, text, options = {}) {
  const width = options.width ?? TEXT_WIDTH;
  const lineGap = options.lineGap ?? LINE_GAP;
  const segments = parseBoldSegments(text);
  if (segments.length === 0) return;
  doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor(COLOR_BODY);
  const opts = { width, lineGap, continued: false, align: "left" };
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    doc.fontSize(FONT_SIZE_BODY).font(seg.bold ? "Helvetica-Bold" : "Helvetica");
    opts.continued = !isLast;
    const x = doc.x;
    const y = doc.y;
    doc.text(seg.text, x, y, opts);
  }
}

/**
 * Construye datos del estudiante para la carta: nombre, documento, programas (doble programa), créditos, promedio.
 * Incluye todos los programas en curso (programFacultyId != null) para doble programa; NOMBRE_PROGRAMA los lista.
 */
function getCartaDataFromPostulant(postulant, profileData) {
  const user = postulant?.postulantId || postulant?.user;
  const nombreCompleto = safeStr(user?.name) || "Estudiante";
  const numeroDocumento = safeStr(user?.code) || "—";

  let nombrePrograma = "—";
  let creditosCursados = "—";
  let creditosTotal = "—";
  let promedio = "—";
  let universidadNombre = "Universidad del Rosario";

  const enrolledList = (profileData?.enrolledPrograms || []).filter((e) => e.programFacultyId != null);
  const programNames = enrolledList
    .map((e) => safeStr(e.programId?.name || e.programId?.code))
    .filter(Boolean);
  if (programNames.length > 0) {
    nombrePrograma = programNames.length === 1 ? programNames[0] : programNames.join(" y ");
  }

  const extraList = profileData?.programExtraInfo || [];
  const firstEnrolled = enrolledList[0];
  if (firstEnrolled) {
    const extra = extraList.find((e) => e.enrolledProgramId?.toString?.() === firstEnrolled._id?.toString?.());
    if (extra) {
      creditosCursados = extra.approvedCredits != null ? String(extra.approvedCredits) : "—";
      creditosTotal = extra.totalCredits != null ? String(extra.totalCredits) : "—";
      promedio = extra.cumulativeAverage != null ? String(extra.cumulativeAverage) : "—";
    }
    const faculty = firstEnrolled.programFacultyId?.facultyId;
    const sucursal = faculty?.sucursalId;
    if (sucursal?.nombre) universidadNombre = sucursal.nombre;
  }

  return {
    NOMBRE_COMPLETO: nombreCompleto,
    NUMERO_DOCUMENTO: numeroDocumento,
    NOMBRE_PROGRAMA: nombrePrograma,
    CREDITOS_CURSADOS: creditosCursados,
    CREDITOS_TOTAL: creditosTotal,
    PROMEDIO: promedio,
    universidadNombre,
  };
}

/**
 * Genera el buffer del PDF de la carta de presentación.
 * @param {object} postulant - Postulante (postulantId populado con name, email, code)
 * @param {object} profileData - { enrolledPrograms (populate programId, programFacultyId.facultyId.sucursalId), programExtraInfo }
 * @param {object} parametrizacion - { logoBase64?, textosInternos: { encabezado, cuerpo, cierre }, firmaBase64?, firmaDatos: { nombre, cargo, unidad }, opcionFechaCarta }
 * @param {{ empresa: string, ciudad: string }} dest - Destinatario (empresa y ciudad)
 * @returns {Promise<Buffer>}
 */
export async function buildCartaPresentacionPdf(postulant, profileData, parametrizacion, dest) {
  const empresa = safeStr(dest?.empresa) || "—";
  const ciudad = safeStr(dest?.ciudad) || "—";
  const textosInternos = parametrizacion?.textosInternos || { encabezado: "", cuerpo: "", cierre: "" };
  const firmaDatos = parametrizacion?.firmaDatos && typeof parametrizacion.firmaDatos === "object"
    ? {
        nombre: safeStr(parametrizacion.firmaDatos.nombre),
        cargo: safeStr(parametrizacion.firmaDatos.cargo),
        unidad: safeStr(parametrizacion.firmaDatos.unidad),
      }
    : { nombre: "", cargo: "", unidad: "" };

  const cartaData = getCartaDataFromPostulant(postulant, profileData);
  const incluirFecha = parametrizacion?.opcionFechaCarta !== "ninguna";
  const fechaTexto = incluirFecha ? formatFechaActual() : "";

  const vars = {
    FECHA: fechaTexto,
    NOMBRE_COMPLETO: cartaData.NOMBRE_COMPLETO,
    NUMERO_DOCUMENTO: cartaData.NUMERO_DOCUMENTO,
    NOMBRE_PROGRAMA: cartaData.NOMBRE_PROGRAMA,
    CREDITOS_CURSADOS: cartaData.CREDITOS_CURSADOS,
    CREDITOS_TOTAL: cartaData.CREDITOS_TOTAL,
    PROMEDIO: cartaData.PROMEDIO,
    NOMBRE_EMPRESA: empresa,
    CIUDAD_EMPRESA: ciudad,
  };

  const encabezadoTemplate = normalizeEncabezadoSaltos(textosInternos.encabezado ?? "");
  const encabezado = replaceVars(encabezadoTemplate, vars);
  const cuerpo = replaceVars(textosInternos.cuerpo ?? "", vars);
  const cierre = replaceVars(textosInternos.cierre ?? "", vars);

  const logoBuffer = await getImageBuffer(parametrizacion?.logoBase64, LOGO_WIDTH, LOGO_HEIGHT).catch(() => null);
  const firmaBuffer = await getImageBuffer(
    parametrizacion?.firmaBase64,
    FIRMA_MAX_WIDTH,
    FIRMA_MAX_HEIGHT
  ).catch(() => null);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor(COLOR_BODY);

    let y = MARGIN;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, y, { width: LOGO_WIDTH, height: LOGO_HEIGHT });
      } catch (e) {
        console.warn("[cartaPresentacionPdf] Logo:", e.message);
      }
      y += LOGO_HEIGHT + 10;
    }

    doc.x = MARGIN;
    doc.y = y;
    const textOpts = { width: TEXT_WIDTH, lineGap: LINE_GAP };
    if (encabezado) {
      doc.font("Helvetica");
      doc.text(encabezado, doc.x, doc.y, { ...textOpts, align: "left" });
      doc.moveDown(0.5);
    }
    doc.x = MARGIN;
    doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor(COLOR_BODY);
    if (cuerpo) {
      drawTextWithBold(doc, cuerpo, textOpts);
      doc.moveDown(0.5);
    }
    doc.x = MARGIN;
    doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor(COLOR_BODY);
    if (cierre) {
      drawTextWithBold(doc, cierre, textOpts);
      doc.moveDown(0.8);
    }

    if (firmaBuffer) {
      try {
        doc.image(firmaBuffer, MARGIN, doc.y, { width: FIRMA_MAX_WIDTH, height: FIRMA_MAX_HEIGHT });
        doc.y += FIRMA_MAX_HEIGHT + 6;
      } catch (e) {
        console.warn("[cartaPresentacionPdf] Firma image:", e.message);
      }
    }

    if (firmaDatos.nombre) {
      doc.font("Helvetica-Bold").fontSize(FONT_SIZE_FIRMA).text(firmaDatos.nombre, MARGIN, doc.y, { continued: false });
      doc.moveDown(0.3);
    }
    if (firmaDatos.cargo) {
      doc.font("Helvetica").text(firmaDatos.cargo, MARGIN, doc.y, { continued: false });
      doc.moveDown(0.3);
    }
    if (firmaDatos.unidad) {
      doc.font("Helvetica").text(firmaDatos.unidad, MARGIN, doc.y, { continued: false });
      doc.moveDown(0.3);
    }
    doc.font("Helvetica").text("Universidad del Rosario", MARGIN, doc.y, { continued: false });

    doc.end();
  });
}
