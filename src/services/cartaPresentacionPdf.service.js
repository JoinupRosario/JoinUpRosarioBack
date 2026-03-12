/**
 * Genera el PDF de la carta de presentación según parametrización.
 * Variables: [FECHA], [NOMBRE_COMPLETO], [NUMERO_DOCUMENTO], [NOMBRE_PROGRAMA], [CREDITOS_CURSADOS], [CREDITOS_TOTAL], [PROMEDIO], [NOMBRE_EMPRESA], [CIUDAD_EMPRESA]
 * Multi-programa: [TEXTO_PROGRAMA_ACADEMICO] (del programa X / de los programas X y Y), [CREDITOS_POR_PROGRAMAS] (créditos por cada programa).
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

/** Escapa caracteres especiales para usarlos en RegExp. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Obtiene rangos [inicio, fin] de posiciones donde hay que poner negrita (por frase buscada).
 * Busca sin distinguir mayúsculas/minúsculas para que negrilla aplique aunque la plantilla tenga el texto en MAYÚSCULAS.
 * Fusiona rangos solapados.
 */
function getBoldRanges(text, phrases) {
  if (!text || typeof text !== "string") return [];
  const ranges = [];
  for (const phrase of phrases) {
    if (phrase == null || String(phrase).trim() === "" || String(phrase) === "—") continue;
    const p = String(phrase).trim();
    if (p.length === 0) continue;
    try {
      const re = new RegExp(escapeRegex(p), "gi");
      let match;
      while ((match = re.exec(text)) !== null) {
        ranges.push([match.index, match.index + match[0].length]);
      }
    } catch (_) {
      const idx = text.indexOf(p);
      if (idx !== -1) ranges.push([idx, idx + p.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

/**
 * Divide el texto en segmentos { text, bold } para dibujar con negrita donde corresponda.
 */
function getSegments(text, boldRanges) {
  if (!text || typeof text !== "string") return [];
  const segments = [];
  let last = 0;
  for (const [s, e] of boldRanges) {
    if (s > last) segments.push({ text: text.slice(last, s), bold: false });
    segments.push({ text: text.slice(s, e), bold: true });
    last = e;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments.filter((seg) => seg.text.length > 0);
}

/**
 * Dibuja un bloque de texto con negrita en nombre, cédula y programas (segmentos según phrasesToBold).
 */
function drawMixedText(doc, text, phrasesToBold, textOpts) {
  if (!text || typeof text !== "string") return;
  const ranges = getBoldRanges(text, phrasesToBold);
  const segments = getSegments(text, ranges);
  if (segments.length === 0) return;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    doc.font(seg.bold ? "Helvetica-Bold" : "Helvetica").fontSize(textOpts.fontSize ?? FONT_SIZE_BODY).fillColor(textOpts.fillColor ?? COLOR_BODY);
    doc.text(seg.text, {
      continued: i < segments.length - 1,
      width: textOpts.width ?? TEXT_WIDTH,
      lineGap: textOpts.lineGap ?? LINE_GAP,
      align: textOpts.align ?? "left",
    });
  }
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

  // Texto para "como estudiante del programa X" o "de los programas X y Y"
  let textoProgramaAcademico = "del programa académico";
  if (programNames.length === 1) {
    textoProgramaAcademico = "del programa " + programNames[0];
  } else if (programNames.length >= 2) {
    const ultimo = programNames[programNames.length - 1];
    const restantes = programNames.slice(0, -1);
    textoProgramaAcademico = "de los programas " + restantes.join(", ") + " y " + ultimo;
  }

  // Créditos y promedio por cada programa (para estudiantes con 2 o más programas)
  const extraList = profileData?.programExtraInfo || [];
  const partesCreditos = [];
  const partesPromedio = [];
  for (const enrolled of enrolledList) {
    const extra = extraList.find((e) => e.enrolledProgramId?.toString?.() === enrolled._id?.toString?.());
    const nombreProg = safeStr(enrolled.programId?.name || enrolled.programId?.code) || "—";
    const cursados = extra?.approvedCredits != null ? String(extra.approvedCredits) : null;
    const total = extra?.totalCredits != null ? String(extra.totalCredits) : null;
    const avg = extra?.cumulativeAverage;
    const avgStr =
      avg != null && avg !== "" && !Number.isNaN(parseFloat(avg)) ? parseFloat(avg).toFixed(2) : null;
    if (cursados != null || total != null) {
      const c = cursados ?? "—";
      const t = total ?? "—";
      const promedioFrase = avgStr ? `, promedio acumulado ${avgStr}` : "";
      partesCreditos.push(`${c} créditos del programa ${nombreProg} (total ${t} créditos del programa${promedioFrase})`);
    }
    if (avgStr) partesPromedio.push(`${avgStr} en el programa ${nombreProg}`);
  }
  const creditosPorProgramas =
    partesCreditos.length === 0
      ? "—"
      : "ha cursado y aprobado " + partesCreditos.join(" y ");
  const textoPromedioPorProgramas =
    partesPromedio.length === 0 ? "—" : "promedio acumulado de " + partesPromedio.join(" y de ");

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
    TEXTO_PROGRAMA_ACADEMICO: textoProgramaAcademico,
    CREDITOS_CURSADOS: creditosCursados,
    CREDITOS_TOTAL: creditosTotal,
    CREDITOS_POR_PROGRAMAS: creditosPorProgramas,
    PROMEDIO: promedio,
    TEXTO_PROMEDIO_POR_PROGRAMAS: textoPromedioPorProgramas,
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
    TEXTO_PROGRAMA_ACADEMICO: cartaData.TEXTO_PROGRAMA_ACADEMICO,
    CREDITOS_CURSADOS: cartaData.CREDITOS_CURSADOS,
    CREDITOS_TOTAL: cartaData.CREDITOS_TOTAL,
    CREDITOS_POR_PROGRAMAS: cartaData.CREDITOS_POR_PROGRAMAS,
    PROMEDIO: cartaData.PROMEDIO,
    TEXTO_PROMEDIO_POR_PROGRAMAS: cartaData.TEXTO_PROMEDIO_POR_PROGRAMAS,
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

  // Cuando el estudiante tiene 2 o más programas: reemplazar en el texto ya procesado para que salga plural, créditos y promedio por programa
  if (enrolledList.length >= 2) {
    const applyMultiProgram = (text) => {
      if (!text || typeof text !== "string") return text;
      let t = text;
      // "del programa académico de X y Y" → "de los programas X y Y" (sirve aunque el nombre venga en mayúsculas en la plantilla)
      if (t.includes("del programa académico de ")) {
        t = t.replace(/del programa académico de /gi, "de los programas ");
      }
      // Frase de créditos de un solo programa → texto con créditos (y promedio) por cada programa
      const fraseCreditosVieja1 =
        "ha cursado y aprobado " + cartaData.CREDITOS_CURSADOS + " créditos, de un total de " + cartaData.CREDITOS_TOTAL + " créditos académicos";
      const fraseCreditosVieja2 =
        "ha cursado y aprobado " + cartaData.CREDITOS_CURSADOS + " créditos, de un total de " + cartaData.CREDITOS_TOTAL + " créditos";
      if (cartaData.CREDITOS_POR_PROGRAMAS !== "—" && (t.includes(fraseCreditosVieja1) || t.includes(fraseCreditosVieja2))) {
        t = t.split(fraseCreditosVieja1).join(cartaData.CREDITOS_POR_PROGRAMAS);
        t = t.split(fraseCreditosVieja2).join(cartaData.CREDITOS_POR_PROGRAMAS);
      }
      // "cuenta con un promedio acumulado de X.XX" → promedio por programa (ej: "cuenta con un promedio acumulado de 4.28 en el programa X y de 4.50 en el programa Y")
      if (cartaData.TEXTO_PROMEDIO_POR_PROGRAMAS !== "—") {
        const frasePromedioVieja = "cuenta con un promedio acumulado de " + cartaData.PROMEDIO;
        if (t.includes(frasePromedioVieja)) {
          t = t.split(frasePromedioVieja).join("cuenta con un " + cartaData.TEXTO_PROMEDIO_POR_PROGRAMAS);
        }
      }
      return t;
    };
    encabezado = applyMultiProgram(encabezado);
    cuerpo = applyMultiProgram(cuerpo);
    cierre = applyMultiProgram(cierre);
  }

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
    const textOpts = { width: TEXT_WIDTH, lineGap: LINE_GAP, align: "left", fontSize: FONT_SIZE_BODY, fillColor: COLOR_BODY };
    const phrasesToBold = [cartaData.NOMBRE_COMPLETO, cartaData.NUMERO_DOCUMENTO, cartaData.NOMBRE_PROGRAMA].filter(
      (p) => p != null && String(p).trim() !== "" && String(p) !== "—"
    );
    if (encabezado) {
      drawMixedText(doc, encabezado, phrasesToBold, textOpts);
      doc.moveDown(0.5);
    }
    doc.x = MARGIN;
    if (cuerpo) {
      drawMixedText(doc, cuerpo, phrasesToBold, textOpts);
      doc.moveDown(0.5);
    }
    doc.x = MARGIN;
    if (cierre) {
      drawMixedText(doc, cierre, phrasesToBold, textOpts);
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
