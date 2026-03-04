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
 * Elige el programa en curso a usar para la carta: si hay codigoPrograma (habilitado para práctica), el que coincida; si no, el primero.
 */
function selectEnrolledForCarta(enrolledList, codigoPrograma) {
  if (!enrolledList || enrolledList.length === 0) return null;
  const code = codigoPrograma != null && String(codigoPrograma).trim() !== "" ? String(codigoPrograma).trim().toUpperCase() : null;
  if (!code) return enrolledList[0];
  const match = enrolledList.find(
    (e) =>
      (e.programId?.code && String(e.programId.code).trim().toUpperCase() === code) ||
      (e.programFacultyId?.code && String(e.programFacultyId.code).trim().toUpperCase() === code)
  );
  return match || enrolledList[0];
}

/**
 * Construye datos del estudiante para la carta: nombre, documento, programas (doble programa), créditos, promedio.
 * Si se pasa preferProgramCode (codigo del programa habilitado para práctica), se usan créditos/promedio de ese programa cuando el estudiante tiene varios.
 */
function getCartaDataFromPostulant(postulant, profileData, preferProgramCode) {
  const user = postulant?.postulantId || postulant?.user;
  const nombreCompleto = safeStr(user?.name) || "Estudiante";
  const studentCode = profileData?.postulantProfile?.studentCode;
  const numeroDocumento =
    studentCode != null && String(studentCode).trim() !== "" ? String(studentCode).trim() : "—";
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
  const firstEnrolled = selectEnrolledForCarta(enrolledList, preferProgramCode);
  if (firstEnrolled) {
    const extra = extraList.find((e) => e.enrolledProgramId?.toString?.() === firstEnrolled._id?.toString?.());
    if (extra) {
      creditosCursados = extra.approvedCredits != null ? String(extra.approvedCredits) : "—";
      creditosTotal = extra.totalCredits != null ? String(extra.totalCredits) : "—";
      // Promedio acumulado: siempre máximo 2 decimales (redondeo numérico)
      const avg = extra.cumulativeAverage;
      if (avg != null && avg !== "") {
        const num = parseFloat(avg);
        promedio = Number.isNaN(num) ? "—" : num.toFixed(2);
      }
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
 * @param {{ empresa: string, ciudad: string, codigoPrograma?: string }} dest - Destinatario (empresa, ciudad) y opcional código del programa habilitado para práctica
 * @returns {Promise<Buffer>}
 */
export async function buildCartaPresentacionPdf(postulant, profileData, parametrizacion, dest) {
  const empresa = safeStr(dest?.empresa) || "—";
  const ciudad = safeStr(dest?.ciudad) || "—";
  const codigoPrograma = dest?.codigoPrograma != null && String(dest.codigoPrograma).trim() !== "" ? String(dest.codigoPrograma).trim() : null;
  const textosInternos = parametrizacion?.textosInternos || { encabezado: "", cuerpo: "", cierre: "" };
  const firmaDatos = parametrizacion?.firmaDatos && typeof parametrizacion.firmaDatos === "object"
    ? {
        nombre: safeStr(parametrizacion.firmaDatos.nombre),
        cargo: safeStr(parametrizacion.firmaDatos.cargo),
        unidad: safeStr(parametrizacion.firmaDatos.unidad),
      }
    : { nombre: "", cargo: "", unidad: "" };

  const cartaData = getCartaDataFromPostulant(postulant, profileData, codigoPrograma);
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
  let encabezado = replaceVars(encabezadoTemplate, vars);
  let cuerpo = replaceVars(textosInternos.cuerpo ?? "", vars);
  let cierre = replaceVars(textosInternos.cierre ?? "", vars);

  // Si la parametrización guardó valores literales en vez de placeholders, corregirlos (mismo programa elegido que para cartaData)
  const enrolledList = (profileData?.enrolledPrograms || []).filter((e) => e.programFacultyId != null);
  const firstEnrolled = selectEnrolledForCarta(enrolledList, codigoPrograma);
  const extraList = profileData?.programExtraInfo || [];
  const extra = firstEnrolled ? extraList.find((e) => e.enrolledProgramId?.toString?.() === firstEnrolled._id?.toString?.()) : null;
  const rawAverageVal = extra?.cumulativeAverage;
  const rawAverageStr = rawAverageVal != null && rawAverageVal !== "" ? String(rawAverageVal) : "";
  const userCodeLiteral =
    (postulant?.postulantId?.code ?? postulant?.user?.code) != null
      ? String(postulant?.postulantId?.code ?? postulant?.user?.code).trim()
      : "";
  const fixLiteralInText = (text) => {
    if (!text || typeof text !== "string") return text;
    let t = text;
    if (userCodeLiteral && cartaData.NUMERO_DOCUMENTO !== userCodeLiteral) {
      t = t.split(userCodeLiteral).join(cartaData.NUMERO_DOCUMENTO);
    }
    if (rawAverageStr && cartaData.PROMEDIO !== rawAverageStr) {
      t = t.split(rawAverageStr).join(cartaData.PROMEDIO);
    }
    if (rawAverageVal != null && cartaData.PROMEDIO !== "—") {
      const num = parseFloat(rawAverageVal);
      if (!Number.isNaN(num)) {
        const longDecimalRegex = new RegExp(
          "\\b" + String(num).replace(".", "\\.") + "\\d*\\b",
          "g"
        );
        t = t.replace(longDecimalRegex, cartaData.PROMEDIO);
      }
    }
    return t;
  };
  encabezado = fixLiteralInText(encabezado);
  cuerpo = fixLiteralInText(cuerpo);
  cierre = fixLiteralInText(cierre);
  // Asegurar salto de línea después de "Señores" en el encabezado final (por si el template no lo tenía)
  encabezado = normalizeEncabezadoSaltos(encabezado);

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
    const textOpts = { width: TEXT_WIDTH, lineGap: LINE_GAP, align: "left" };
    doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor(COLOR_BODY);
    if (encabezado) {
      doc.text(encabezado, doc.x, doc.y, textOpts);
      doc.moveDown(0.5);
    }
    doc.x = MARGIN;
    doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor(COLOR_BODY);
    if (cuerpo) {
      doc.text(cuerpo, doc.x, doc.y, textOpts);
      doc.moveDown(0.5);
    }
    doc.x = MARGIN;
    doc.fontSize(FONT_SIZE_BODY).font("Helvetica").fillColor(COLOR_BODY);
    if (cierre) {
      doc.text(cierre, doc.x, doc.y, textOpts);
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
