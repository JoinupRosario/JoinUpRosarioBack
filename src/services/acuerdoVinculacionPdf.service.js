/**
 * Genera el PDF del Acuerdo de Vinculación para Práctica Laboral.
 * La plataforma genera el documento con tablas (estudiante, escenario de práctica, universidad, características)
 * y textos legales parametrizables. Soporta logo en parametrización.
 */
import PDFDocument from "pdfkit";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Margen estándar según norma (2,5 cm ≈ 72 pt para documentos formales). */
const MARGIN = 72;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LOGO_WIDTH = 120;
const LOGO_HEIGHT = 48;

async function getLogoBuffer(base64) {
  if (!base64 || typeof base64 !== "string") return null;
  const trimmed = base64.trim();
  const isSvg = trimmed.startsWith("data:image/svg") || trimmed.startsWith("<svg");
  if (isSvg) {
    try {
      const base64Part = trimmed.includes(",") ? trimmed.split(",")[1] : null;
      const svgBuffer = base64Part ? Buffer.from(base64Part, "base64") : Buffer.from(trimmed, "utf8");
      return await sharp(svgBuffer).resize(LOGO_WIDTH * 2, LOGO_HEIGHT * 2, { fit: "inside" }).png().toBuffer();
    } catch (e) {
      return null;
    }
  }
  const data = trimmed.includes(",") ? trimmed.split(",")[1] : trimmed;
  try {
    return Buffer.from(data, "base64");
  } catch (e) {
    return null;
  }
}
const FONT_SIZE_TITLE = 10;
const FONT_SIZE_HEADER = 9;
const FONT_SIZE_SECTION = 14;
const FONT_SIZE_CELL = 8;
const FONT_SIZE_BODY = 12;
const ROW_HEIGHT = 18;
const LINE_HEIGHT_BODY = 16;
const HEADER_BG = "#e5e7eb";
const BORDER = "#9ca3af";

function safe(v) {
  if (v == null || v === undefined) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Dibuja el header (logo + título en la misma línea). Título en negro, pequeño, al lado del logo.
 */
function drawHeader(doc, logoBuffer, startY) {
  const y = startY;
  const titleText = "ACUERDO VINCULACIÓN PARA PRÁCTICA LABORAL";
  doc.font("Helvetica-Bold").fontSize(FONT_SIZE_TITLE).fillColor("#000000");

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, MARGIN, y, { width: LOGO_WIDTH, height: LOGO_HEIGHT });
      const titleX = MARGIN + LOGO_WIDTH + 14;
      const titleWidth = TEXT_WIDTH - (titleX - MARGIN);
      doc.text(titleText, titleX, y + LOGO_HEIGHT / 2 - 5, {
        width: titleWidth,
        align: "left",
        lineBreak: true,
      });
    } catch (e) {
      doc.text(titleText, MARGIN, y, { width: TEXT_WIDTH, align: "left" });
    }
  } else {
    doc.text(titleText, MARGIN, y, { width: TEXT_WIDTH, align: "left" });
  }

  return y + LOGO_HEIGHT + 10;
}

/** Nombre de fuente para cuerpo: Arial si está disponible, si no Helvetica. */
let bodyFont = "Helvetica";
let bodyFontBold = "Helvetica-Bold";

function registerArialIfAvailable(doc) {
  const candidates = [
    path.join(__dirname, "fonts", "arial.ttf"),
    path.join(process.cwd(), "fonts", "arial.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        doc.registerFont("Arial", p);
        const dir = path.dirname(p);
        const ext = path.extname(p);
        const boldPath = path.join(dir, "arialbd" + ext);
        if (fs.existsSync(boldPath)) {
          doc.registerFont("ArialBold", boldPath);
          bodyFontBold = "ArialBold";
        }
        bodyFont = "Arial";
        break;
      }
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Parsea texto con **negrita** y devuelve segmentos [{ text, bold }].
 */
function parseBoldSegments(str) {
  if (!str || typeof str !== "string") return [];
  const segments = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: str.slice(lastIndex, m.index), bold: false });
    }
    segments.push({ text: m[1], bold: true });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < str.length) segments.push({ text: str.slice(lastIndex), bold: false });
  return segments.filter((s) => s.text.length > 0);
}

/**
 * Convierte segmentos en líneas que caben en width. Cada línea es un array de { text, bold } (por palabra).
 */
function flowSegmentsToLines(doc, segments, width, fontSize) {
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;
  doc.font(bodyFont).fontSize(fontSize);
  const spaceWidth = doc.widthOfString(" ");

  function flushLine() {
    if (currentLine.length) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }
  }

  for (const seg of segments) {
    doc.font(seg.bold ? bodyFontBold : bodyFont).fontSize(fontSize);
    const words = seg.text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wWidth = doc.widthOfString(w);
      const needSpace = currentLine.length > 0;
      const addWidth = (needSpace ? spaceWidth : 0) + wWidth;
      if (currentWidth + addWidth > width && currentLine.length > 0) {
        flushLine();
      }
      const spaceBefore = currentLine.length > 0 ? spaceWidth : 0;
      if (currentLine.length) currentWidth += spaceBefore;
      currentLine.push({ text: w, bold: seg.bold });
      currentWidth += wWidth;
    }
    if (seg.text.endsWith("\n")) flushLine();
  }
  flushLine();
  return lines;
}

/**
 * Dibuja una línea formada por runs [{ text, bold }].
 * centerLine: si es true (p. ej. texto envuelto en <c>...</c>), la línea va centrada; si no, se justifica.
 */
function drawBodyLine(doc, lineRuns, x, y, width, fontSize, isLastLineOfParagraph, centerLine = false) {
  if (lineRuns.length === 0) return y + LINE_HEIGHT_BODY;
  let totalWidth = 0;
  doc.font(bodyFont).fontSize(fontSize);
  const spaceW = doc.widthOfString(" ");
  for (let i = 0; i < lineRuns.length; i++) {
    const r = lineRuns[i];
    doc.font(r.bold ? bodyFontBold : bodyFont);
    if (i > 0) totalWidth += spaceW;
    totalWidth += doc.widthOfString(r.text);
  }
  const numSpaces = lineRuns.length - 1;
  const justify = !centerLine && !isLastLineOfParagraph && numSpaces > 0 && totalWidth < width * 0.95;
  const extraPerSpace = justify ? (width - totalWidth) / Math.max(1, numSpaces) : 0;
  const startX = centerLine ? x + (width - totalWidth) / 2 : x;

  let cx = startX;
  for (let i = 0; i < lineRuns.length; i++) {
    const r = lineRuns[i];
    doc.font(r.bold ? bodyFontBold : bodyFont).fontSize(fontSize).fillColor("#000000");
    if (i > 0) cx += spaceW + extraPerSpace;
    doc.text(r.text, cx, y, { lineBreak: false });
    cx += doc.widthOfString(r.text);
  }
  doc.font(bodyFont).fontSize(fontSize);
  return y + LINE_HEIGHT_BODY;
}

const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN;

/**
 * Dibuja una tabla de 2 columnas (etiqueta | valor). rows: [{ label, value }].
 * Añade página y header cuando no hay espacio (para que todas las hojas tengan header).
 */
function drawTable2Cols(doc, title, rows, startY, logoBuffer) {
  const col1W = 220;
  const col2W = TEXT_WIDTH - col1W;
  let y = startY;

  doc.font("Helvetica-Bold").fontSize(FONT_SIZE_HEADER).fillColor("#1f2937");
  if (y + 20 > BOTTOM_LIMIT && logoBuffer !== undefined) {
    doc.addPage({ size: "A4", margin: MARGIN });
    y = drawHeader(doc, logoBuffer, MARGIN);
  }
  doc.text(title, MARGIN, y);
  y += 20;

  doc.font("Helvetica").fontSize(FONT_SIZE_CELL);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = safe(row.label);
    const value = safe(row.value);
    const cellH = Math.max(ROW_HEIGHT, doc.heightOfString(value, { width: col2W }) + 8);

    if (y + cellH > BOTTOM_LIMIT && logoBuffer !== undefined) {
      doc.addPage({ size: "A4", margin: MARGIN });
      y = drawHeader(doc, logoBuffer, MARGIN);
      doc.font("Helvetica").fontSize(FONT_SIZE_CELL);
    }

    doc.rect(MARGIN, y, col1W, cellH).fillAndStroke(HEADER_BG, BORDER);
    doc.rect(MARGIN + col1W, y, col2W, cellH).stroke(BORDER);
    doc.fillColor("#374151").text(label, MARGIN + 6, y + 6, { width: col1W - 12 });
    doc.fillColor("#111827").text(value, MARGIN + col1W + 6, y + 6, { width: col2W - 12 });
    y += cellH;
  }
  return y + 12;
}

function drawSignatureLine(doc, x, y, width) {
  const lineY = y + 2;
  doc.moveTo(x, lineY).lineTo(x + width, lineY).strokeColor("#111827").lineWidth(0.7).stroke();
  return y + 8;
}

function drawClosingAndSignatures(doc, y, logoBuffer, data) {
  const { estudiante = {}, escenario = {}, universidad = {} } = data || {};
  const startX = MARGIN;
  const usableWidth = TEXT_WIDTH;
  const bodySize = 12;
  const smallSize = 10;
  const closingLines = [
    { text: `**LA UNIVERSIDAD** en ${universidad.direccion || "la ciudad de Bogotá D.C."}`, gapAfter: 12 },
    { text: `**EL ESCENARIO DE PRÁCTICA** en ${escenario.direccion || "—"}`, gapAfter: 12 },
    { text: `**EL PRACTICANTE** en ${estudiante.direccion || "—"}`, gapAfter: 14 },
    {
      text: "Para constancia, se firma el presente documento en tres (3) ejemplares del mismo tenor, con destino a cada una de LAS PARTES, a los veinte (20) días del mes de febrero del año dos mil veintiseis (2026).",
      gapAfter: 22,
    },
  ];

  const signers = [
    {
      title: "EL PRACTICANTE,",
      name: estudiante.nombreApellidos || "—",
      id: `CC No.${estudiante.numeroDocumento || "—"}`,
      extra: "",
    },
    {
      title: "LA UNIVERSIDAD,",
      name: universidad.representanteNombre || "—",
      id: `CC No. ${universidad.representanteNumeroDoc || "—"} de Bogotá D.C.`,
      extra: "",
    },
    {
      title: "ESCENARIO DE PRÁCTICA LABORAL",
      name: escenario.representanteLegalNombre || "—",
      id: `CC No. ${escenario.representanteNumeroDoc || "—"}`,
      extra: "",
    },
  ];

  const estimateHeight = 220;
  if (y + estimateHeight > BOTTOM_LIMIT) {
    doc.addPage({ size: "A4", margin: MARGIN });
    y = drawHeader(doc, logoBuffer, MARGIN);
  }

  y += 18;
  doc.font(bodyFont).fontSize(bodySize).fillColor("#000000");
  for (const line of closingLines) {
    const parts = parseBoldSegments(line.text);
    const lineList = flowSegmentsToLines(doc, parts, usableWidth, bodySize);
    for (let i = 0; i < lineList.length; i++) {
      const isLast = i === lineList.length - 1;
      const lineHeight = isLast ? LINE_HEIGHT_BODY : LINE_HEIGHT_BODY;
      if (y + lineHeight > BOTTOM_LIMIT) {
        doc.addPage({ size: "A4", margin: MARGIN });
        y = drawHeader(doc, logoBuffer, MARGIN);
        doc.font(bodyFont).fontSize(bodySize).fillColor("#000000");
      }
      y = drawBodyLine(doc, lineList[i], startX, y, usableWidth, bodySize, isLast, false);
    }
    y += line.gapAfter || 0;
  }

  y += 12;
  for (const signer of signers) {
    const blockStart = y;
    const titleHeight = doc.heightOfString(signer.title, { width: usableWidth });
    const nameHeight = doc.heightOfString(signer.name, { width: usableWidth });
    const idHeight = doc.heightOfString(signer.id, { width: usableWidth });
    const extraHeight = signer.extra ? doc.heightOfString(signer.extra, { width: usableWidth }) + 2 : 0;
    const blockHeight = 12 + titleHeight + 16 + nameHeight + 4 + idHeight + extraHeight + 12;

    if (y + blockHeight > BOTTOM_LIMIT) {
      doc.addPage({ size: "A4", margin: MARGIN });
      y = drawHeader(doc, logoBuffer, MARGIN);
    }

    doc.font(bodyFontBold).fontSize(smallSize).fillColor("#000000");
    doc.text(signer.title, startX, y, { width: usableWidth, align: "left" });
    y += Math.max(12, doc.heightOfString(signer.title, { width: usableWidth }) + 2);

    y += 16;
    y = drawSignatureLine(doc, startX, y, 220);

    doc.font(bodyFont).fontSize(smallSize).fillColor("#000000");
    doc.text(signer.name, startX, y, { width: usableWidth, align: "left" });
    y += Math.max(12, nameHeight + 2);
    doc.text(signer.id, startX, y, { width: usableWidth, align: "left" });
    y += Math.max(12, idHeight + 2);

    if (signer.extra) {
      doc.text(signer.extra, startX, y, { width: usableWidth, align: "left" });
      y += Math.max(12, extraHeight + 2);
    }

    y += 18;
  }

  return y;
}

/**
 * Genera el buffer del PDF del Acuerdo de Vinculación.
 * @param {object} data - { estudiante, escenario, universidad, practica, parametrizacion }
 *   - estudiante: { nombreApellidos, tipoDocumento, numeroDocumento, facultad, programa, semestre, creditosAprobados }
 *   - escenario: { nombreOrganizacion, tipoIdentificacion, nit, representanteLegalNombre, representanteTipoDoc, representanteNumeroDoc, tutorNombre, tutorTipoDoc, tutorNumeroDoc }
 *   - universidad: { tipoIdentificacion, numeroIdentificacion, representanteNombre, representanteTipoDoc, representanteNumeroDoc, monitorNombre, monitorTipoDoc, monitorNumeroDoc }
 *   - practica: { fechaInicio, fechaFin, dedicacion, horario, fechaEvaluacionParcial, fechaEvaluacionFinal, conAuxilio, valor }
 *   - parametrizacion: { logoBase64?, textosLegalesAcuerdo? }
 * @returns {Promise<Buffer>}
 */
export async function buildAcuerdoVinculacionPdf(data) {
  const { estudiante = {}, escenario = {}, universidad = {}, practica = {}, parametrizacion = {} } = data;

  const rowsEstudiante = [
    { label: "Tipo de documento de identificación", value: estudiante.tipoDocumento || "C.C." },
    { label: "Número de documento de identificación", value: estudiante.numeroDocumento },
    { label: "Facultad / Escuela", value: estudiante.facultad },
    { label: "Programa académico", value: estudiante.programa },
    { label: "Semestre / Periodo académico", value: estudiante.semestre },
    { label: "Créditos académicos aprobados", value: estudiante.creditosAprobados },
  ];

  const rowsEscenario = [
    { label: "Tipo de identificación", value: escenario.tipoIdentificacion || "NIT" },
    { label: "Número de identificación tributaria", value: escenario.nit },
    { label: "Representante legal o apoderado", value: escenario.representanteLegalNombre },
    { label: "Tipo de documento de identificación", value: escenario.representanteTipoDoc || "C.C." },
    { label: "Número de documento de identificación", value: escenario.representanteNumeroDoc },
    { label: "Tutor designado", value: escenario.tutorNombre },
    { label: "Tipo de documento de identificación tutor", value: escenario.tutorTipoDoc || "C.C." },
    { label: "Número de documento de identificación tutor", value: escenario.tutorNumeroDoc },
  ];

  const rowsUniversidad = [
    { label: "Tipo de identificación", value: universidad.tipoIdentificacion || "NIT" },
    { label: "Número identificación", value: universidad.numeroIdentificacion },
    { label: "Representante legal o apoderado", value: universidad.representanteNombre },
    { label: "Tipo de documento de identificación", value: universidad.representanteTipoDoc || "C.C." },
    { label: "Número de documento de identificación", value: universidad.representanteNumeroDoc },
    { label: "Monitor designado", value: universidad.monitorNombre },
    { label: "Tipo de documento de identificación monitor", value: universidad.monitorTipoDoc || "C.C." },
    { label: "Número de documento de identificación monitor", value: universidad.monitorNumeroDoc },
  ];

  const dedicacionText = practica.dedicacion || "—";
  const rowsPractica = [
    { label: "Fecha de inicio (día/mes/año)", value: formatDate(practica.fechaInicio) },
    { label: "Fecha de finalización (día/mes/año)", value: formatDate(practica.fechaFin) },
    { label: "Dedicación (cumplir la jornada máxima permitida)", value: dedicacionText },
    { label: "Horario", value: practica.horario },
    { label: "Fecha de evaluación parcial (día/mes/año)", value: formatDate(practica.fechaEvaluacionParcial) },
    { label: "Fecha de evaluación final (día/mes/año)", value: formatDate(practica.fechaEvaluacionFinal) },
    {
      label: "Práctica laboral con auxilio",
      value: practica.conAuxilio === true ? "Sí" : practica.conAuxilio === false ? "No" : "—",
    },
    { label: "Valor", value: practica.valor != null ? `$${Number(practica.valor).toLocaleString("es-CO")}` : "—" },
  ];

  const textosLegales = typeof parametrizacion.textosLegalesAcuerdo === "string"
    ? parametrizacion.textosLegalesAcuerdo
    : "";

  const logoBuffer = await getLogoBuffer(parametrizacion.logoBase64);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    registerArialIfAvailable(doc);

    let y = drawHeader(doc, logoBuffer, MARGIN);

    doc.font(bodyFont).fontSize(FONT_SIZE_CELL).fillColor("#111827");

    y = drawTable2Cols(doc, "ESTUDIANTE / PRACTICANTE", rowsEstudiante, y, logoBuffer);
    y = drawTable2Cols(doc, "EMPRESA / INSTITUCIÓN (Escenario de práctica laboral)", rowsEscenario, y, logoBuffer);
    y = drawTable2Cols(doc, "UNIVERSIDAD DEL ROSARIO", rowsUniversidad, y, logoBuffer);
    y = drawTable2Cols(doc, "Características de la práctica laboral", rowsPractica, y, logoBuffer);

    if (textosLegales && textosLegales.trim()) {
      if (y + 14 + 20 + LINE_HEIGHT_BODY > BOTTOM_LIMIT) {
        doc.addPage({ size: "A4", margin: MARGIN });
        y = drawHeader(doc, logoBuffer, MARGIN);
      }
      y += 14;
      doc.font(bodyFontBold).fontSize(FONT_SIZE_SECTION).fillColor("#1f2937");
      doc.text("Consideraciones preliminares", MARGIN, y, { align: "center", width: TEXT_WIDTH });
      y += 22 + LINE_HEIGHT_BODY;

      doc.font(bodyFont).fontSize(FONT_SIZE_BODY).fillColor("#000000");
      const normalizedLines = textosLegales
        .trim()
        .replace(/\r\n/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .split("\n");

      for (const rawLine of normalizedLines) {
        const lineContent = rawLine.trim();
        if (!lineContent) {
          y += LINE_HEIGHT_BODY;
          continue;
        }

        let centerThisLine = false;
        let content = lineContent;
        const centerMatch = content.match(/^\s*<c>\s*([\s\S]*?)\s*<\/c>\s*$/i);
        if (centerMatch) {
          content = centerMatch[1].trim();
          centerThisLine = true;
        }

        if (!content) {
          y += LINE_HEIGHT_BODY;
          continue;
        }

        const segments = parseBoldSegments(content);
        const lineList = flowSegmentsToLines(doc, segments, TEXT_WIDTH, FONT_SIZE_BODY);
        for (let i = 0; i < lineList.length; i++) {
          if (y + LINE_HEIGHT_BODY > BOTTOM_LIMIT) {
            doc.addPage({ size: "A4", margin: MARGIN });
            y = drawHeader(doc, logoBuffer, MARGIN);
            doc.font(bodyFont).fontSize(FONT_SIZE_BODY).fillColor("#000000");
          }
          const isLastOfLine = i === lineList.length - 1;
          y = drawBodyLine(doc, lineList[i], MARGIN, y, TEXT_WIDTH, FONT_SIZE_BODY, isLastOfLine, centerThisLine);
        }
      }
    }

    y = drawClosingAndSignatures(doc, y, logoBuffer, {
      estudiante,
      escenario,
      universidad,
    });

    doc.end();
  });
}
