/**
 * Genera el PDF de la hoja de vida según la parametrización (orden, visibilidad, logo en base64).
 * Formato: logo y nombre en la misma fila; secciones con título en mayúsculas y línea; datos de contacto con iconos.
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const SECTION_TITLE_FONT_SIZE = 11;
const BODY_FONT_SIZE = 10;
const HEADER_NAME_FONT_SIZE = 18;
const HEADER_ROLE_FONT_SIZE = 11;
const LOGO_WIDTH = 140;
const LOGO_HEIGHT = 60;
const ICON_SIZE = 14;
const ICON_GAP = 3;
const ICON_COLOR = "#c41e3a";
const ICON_NAMES = ["location", "email", "phone", "linkedin", "mobile"];

// Paleta profesional: títulos oscuros, texto gris legible, líneas sutiles
const COLOR_TITLE = "#1a1a1a";
const COLOR_BODY = "#4a4a4a";
const COLOR_LINE = "#333333";
const COLOR_SUBTLE = "#6b6b6b";

function safeStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

/** Extrae el buffer de imagen desde logo en base64 (data URL o raw base64). Convierte SVG a PNG automáticamente. */
async function getLogoBuffer(logoBase64) {
  if (!logoBase64 || typeof logoBase64 !== "string") return null;
  const trimmed = logoBase64.trim();

  const isSvgDataUrl = trimmed.startsWith("data:image/svg");
  const isRawSvg = trimmed.startsWith("<svg");

  if (isSvgDataUrl || isRawSvg) {
    try {
      let svgBuffer;
      if (isSvgDataUrl) {
        const base64Part = trimmed.split(",")[1];
        svgBuffer = Buffer.from(base64Part, "base64");
      } else {
        svgBuffer = Buffer.from(trimmed, "utf8");
      }
      const pngBuffer = await sharp(svgBuffer)
        .resize(LOGO_WIDTH * 3, LOGO_HEIGHT * 3, { fit: "inside", withoutEnlargement: false })
        .png()
        .toBuffer();
      return pngBuffer;
    } catch (e) {
      console.warn("[hojaVidaPdf] No se pudo convertir SVG a PNG:", e.message);
      return null;
    }
  }

  const base64Data = trimmed.includes(",") ? trimmed.split(",")[1] : trimmed;
  if (!base64Data) return null;
  try {
    return Buffer.from(base64Data, "base64");
  } catch (e) {
    console.warn("[hojaVidaPdf] Error al decodificar logo base64:", e.message);
    return null;
  }
}

function drawSectionTitle(doc, title) {
  doc.fontSize(SECTION_TITLE_FONT_SIZE).font("Helvetica-Bold").fillColor(COLOR_TITLE);
  doc.text(title.toUpperCase(), MARGIN, doc.y, { width: PAGE_WIDTH - 2 * MARGIN, align: "left", continued: false });
  const y = doc.y;
  doc.strokeColor(COLOR_LINE).lineWidth(1.2).moveTo(MARGIN, y + 4).lineTo(PAGE_WIDTH - MARGIN, y + 4).stroke();
  doc.strokeColor("#000").lineWidth(1);
  doc.moveDown(1);
}

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Carga iconos PNG desde assets/icons (location, email, phone, linkedin, mobile). Si no existen, devuelve null por clave. */
function loadContactIcons() {
  const iconsDir = path.join(__dirname, "..", "assets", "icons");
  const out = {};
  for (const name of ICON_NAMES) {
    const filePath = path.join(iconsDir, `${name}.png`);
    try {
      if (fs.existsSync(filePath)) out[name] = fs.readFileSync(filePath);
      else out[name] = null;
    } catch {
      out[name] = null;
    }
  }
  return out;
}

/** Dibuja un icono de contacto: imagen PNG o círculo rojo si no hay imagen. */
function drawContactIcon(doc, iconBuffer, x, y) {
  if (iconBuffer && iconBuffer.length > 0) {
    try {
      doc.image(iconBuffer, x, y, { width: ICON_SIZE, height: ICON_SIZE });
    } catch {
      doc.circle(x + ICON_SIZE / 2, y + ICON_SIZE / 2, ICON_SIZE / 2 - 1).fill(ICON_COLOR);
    }
  } else {
    doc.circle(x + ICON_SIZE / 2, y + ICON_SIZE / 2, ICON_SIZE / 2 - 1).fill(ICON_COLOR);
  }
}

function sectionDatosBasicos(doc, profileData, postulant, options = {}) {
  const contactIcons = options.contactIcons || {};
  const user = postulant?.postulantId || postulant?.user;
  const email = user?.email || postulant?.alternateEmail || "—";
  const phone = postulant?.phone || "—";
  const address = postulant?.address || "—";
  const linkedin = postulant?.linkedinLink || postulant?.personalWebsite || "—";
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica").fillColor(COLOR_BODY);
  const contentWidth = PAGE_WIDTH - 2 * MARGIN;
  const slotWidth = contentWidth / 3; // misma cuadrícula para ambas filas: email/linkedin alineados con location/phone
  const row1Items = [
    { icon: "location", text: safeStr(address) },
    { icon: "phone", text: safeStr(phone) },
    { icon: "mobile", text: safeStr(phone) },
  ];
  const row2Items = [
    { icon: "email", text: safeStr(email) },
    { icon: "linkedin", text: safeStr(linkedin) },
  ];
  const lineHeight = 20;
  const rowGap = 10;

  function drawRow(items, slotIndices) {
    const baseY = doc.y;
    const textMaxWidth = slotWidth - ICON_SIZE - ICON_GAP - 8;
    // Alinea verticalmente el ícono con el texto (centrado respecto a font size ~10)
    const iconOffsetY = Math.round((BODY_FONT_SIZE - ICON_SIZE) / 2);
    slotIndices.forEach((slotIndex, i) => {
      const item = items[i];
      const slotLeft = MARGIN + slotIndex * slotWidth;
      const iconX = slotLeft;
      const textX = slotLeft + ICON_SIZE + ICON_GAP;
      drawContactIcon(doc, contactIcons[item.icon] ?? null, iconX, baseY + iconOffsetY);
      doc.text(item.text, textX, baseY, { width: textMaxWidth, align: "left", continued: false });
    });
    doc.y = baseY + lineHeight;
  }

  drawRow(row1Items, [0, 1, 2]);
  doc.y += rowGap;
  drawRow(row2Items, [0, 1]); // email y LinkedIn inician en la misma columna que location y phone
}

function sectionCedula(doc, profileData, postulant) {
  const supports = profileData?.profileSupports || [];
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (supports.length === 0) doc.text("Documento(s) de soporte adjunto(s) en el perfil.", { continued: false });
  else supports.forEach((s) => doc.text(`• ${safeStr(s?.attachmentId?.name || "Documento")}`, { continued: false }));
}

function sectionPerfil(doc, profileData, postulant) {
  const p = profileData?.postulantProfile;
  const version = profileData?.selectedProfileVersion;
  const text = version?.profileText ?? p?.profileText ?? "—";
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  doc.text(safeStr(text), { continued: false, lineGap: 4 });
}

function sectionFormacionRosarioEnCurso(doc, profileData, postulant) {
  const list = (profileData?.enrolledPrograms || []).filter((ep) => ep.programFacultyId != null);
  const extraList = profileData?.programExtraInfo || [];
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (list.length === 0) doc.text("No registrada.", { continued: false });
  else
    list.forEach((ep) => {
      const program = ep.programId?.name || "—";
      const faculty = ep.programFacultyId?.facultyId?.name || ep.programFacultyId?.code || "—";
      const extra = extraList.find((e) => String(e.enrolledProgramId) === String(ep._id));
      const sem = extra?.accordingCreditSemester != null ? `${extra.accordingCreditSemester} semestre` : "—";
      doc.text(`${program} - ${sem}`, { continued: false });
      doc.text(`Universidad del Rosario`, { continued: false });
      const city = ep.cityId?.name || "—";
      const country = ep.countryId?.name || "Colombia";
      doc.text(`${city}, ${country}`, { continued: false });
      doc.moveDown(0.3);
    });
}

function sectionFormacionRosarioFinalizada(doc, profileData, postulant) {
  const list = profileData?.graduatePrograms || [];
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (list.length === 0) doc.text("No registrada.", { continued: false });
  else
    list.forEach((gp) => {
      const program = gp.programId?.name || "—";
      const faculty = gp.programFacultyId?.facultyId?.name || gp.programFacultyId?.code || "—";
      const dateStr = gp.dateObtained ? formatDate(gp.dateObtained) : "—";
      doc.text(`${program} (${dateStr})`, { continued: false });
      doc.text(`Universidad del Rosario`, { continued: false });
      const city = gp.cityId?.name || "—";
      const country = gp.countryId?.name || "Colombia";
      doc.text(`${city}, ${country}`, { continued: false });
      doc.moveDown(0.3);
    });
}

function sectionFormacionEnCursoOtras(doc, profileData, postulant) {
  const list = (profileData?.enrolledPrograms || []).filter((ep) => ep.programFacultyId == null);
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (list.length === 0) doc.text("No registrada.", { continued: false });
  else list.forEach((ep) => {
    const program = ep.programId?.name || "—";
    const univ = ep.university?.value || ep.university?.name || "—";
    const city = ep.cityId?.name || "";
    const country = ep.countryId?.name || "";
    doc.text(`${program} - ${univ}`, { continued: false });
    if (city || country) doc.text(`${city}${city && country ? ", " : ""}${country}`, { continued: false });
    doc.moveDown(0.3);
  });
}

function sectionFormacionFinalizadaOtras(doc, profileData, postulant) {
  const list = profileData?.otherStudies || [];
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (list.length === 0) doc.text("No registrada.", { continued: false });
  else list.forEach((os) => {
    const name = os.studyName || "—";
    const inst = os.studyInstitution || "—";
    const year = os.studyYear ? `(${os.studyYear})` : "";
    doc.text(`${safeStr(name)} ${year}`, { continued: false });
    doc.text(safeStr(inst), { continued: false });
    doc.moveDown(0.3);
  });
}

function sectionOtrosEstudios(doc, profileData, postulant) {
  sectionFormacionFinalizadaOtras(doc, profileData, postulant);
}

function sectionExperienciaLaboral(doc, profileData, postulant) {
  const list = (profileData?.workExperiences || []).filter((w) => (w.experienceType || "JOB_EXP") === "JOB_EXP");
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (list.length === 0) doc.text("No registrada.", { continued: false });
  else list.forEach((w) => {
    doc.text(`${safeStr(w.jobTitle)}`, { continued: false });
    doc.text(`${safeStr(w.companyName)}`, { continued: false });
    const city = w.cityId?.name || "";
    const country = w.countryId?.name || "";
    if (city || country) doc.text(`${city}${city && country ? ", " : ""}${country}`, { continued: false });
    doc.text(`${formatDate(w.startDate)} - ${w.noEndDate ? "Actualidad" : formatDate(w.endDate)}`, { continued: false });
    if (w.achievements) doc.text(safeStr(w.achievements), { continued: false });
    doc.moveDown(0.5);
  });
}

function sectionOtrasExperiencias(doc, profileData, postulant) {
  const list = (profileData?.workExperiences || []).filter((w) => (w.experienceType || "JOB_EXP") !== "JOB_EXP");
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (list.length === 0) doc.text("No registrada.", { continued: false });
  else list.forEach((w) => {
    doc.text(`${safeStr(w.jobTitle)} - ${safeStr(w.companyName)}`, { continued: false });
    doc.text(`${formatDate(w.startDate)} - ${w.noEndDate ? "Actualidad" : formatDate(w.endDate)}`, { continued: false });
    if (w.achievements) doc.text(safeStr(w.achievements), { continued: false });
    doc.moveDown(0.5);
  });
}

function sectionLogros(doc, profileData, postulant) {
  const list = profileData?.awards || [];
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  const disclaimer = "La Universidad del Rosario no se hace responsable de la veracidad de la información ingresada en relación a los estudios o experiencia externos a la institución relacionados por el postulante.";
  if (list.length === 0) doc.text("No registrados.", { continued: false });
  else list.forEach((a) => {
    doc.text(`• ${safeStr(a.awardName || a.awardType?.name || a.awardType?.value)}${a.awardDate ? ` (${formatDate(a.awardDate)})` : ""}`, { continued: false });
  });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor(COLOR_SUBTLE);
  doc.text(disclaimer, { continued: false, lineGap: 2 });
  doc.fillColor(COLOR_BODY);
}

function sectionReferencias(doc, profileData, postulant) {
  const list = profileData?.references || [];
  doc.fontSize(BODY_FONT_SIZE).font("Helvetica");
  if (list.length === 0) doc.text("No registradas.", { continued: false });
  else list.forEach((r) => {
    doc.text(`• ${safeStr(r.firstname)} ${safeStr(r.lastname)} - ${safeStr(r.occupation)} - ${safeStr(r.phone)}`, { continued: false });
  });
}

const SECTION_RENDERERS = {
  datos_basicos: sectionDatosBasicos,
  cedula: sectionCedula,
  perfil: sectionPerfil,
  formacion_rosario_en_curso: sectionFormacionRosarioEnCurso,
  formacion_rosario_finalizada: sectionFormacionRosarioFinalizada,
  formacion_en_curso_otras: sectionFormacionEnCursoOtras,
  formacion_finalizada_otras: sectionFormacionFinalizadaOtras,
  otros_estudios: sectionOtrosEstudios,
  experiencia_laboral: sectionExperienciaLaboral,
  otras_experiencias: sectionOtrasExperiencias,
  logros: sectionLogros,
  referencias: sectionReferencias,
};

/** Títulos de sección para el PDF (como en el formato oficial). */
const SECTION_TITLE_OVERRIDE = {
  datos_basicos: "DATOS DE CONTACTO",
  perfil: "PERFIL PROFESIONAL",
  formacion_rosario_en_curso: "FORMACIÓN ACADÉMICA",
  formacion_rosario_finalizada: "FORMACIÓN ACADÉMICA",
  formacion_en_curso_otras: "FORMACIÓN ACADÉMICA (OTRAS)",
  formacion_finalizada_otras: "FORMACIÓN ACADÉMICA (OTRAS)",
  otros_estudios: "OTROS ESTUDIOS",
  experiencia_laboral: "EXPERIENCIA PROFESIONAL / VOLUNTARIADOS",
  otras_experiencias: "EXPERIENCIA PROFESIONAL / VOLUNTARIADOS",
  logros: "LOGROS",
  referencias: "REFERENCIAS",
};

/** Dibuja idiomas y habilidades en dos columnas. */
function drawIdiomasYHabilidades(doc, profileData) {
  const languages = profileData?.languages || [];
  const skills = profileData?.skills || [];
  const p = profileData?.postulantProfile;
  const skillsText = p?.skillsTechnicalSoftware || (skills.length ? skills.map((s) => s?.skillId?.name || s?.skillId).filter(Boolean).join(", ") : "—");
  const colWidth = (PAGE_WIDTH - 2 * MARGIN - 24) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + 24;
  const startY = doc.y;

  doc.fontSize(SECTION_TITLE_FONT_SIZE).font("Helvetica-Bold").fillColor(COLOR_TITLE);
  doc.text("IDIOMAS", leftX, startY, { width: colWidth });
  doc.text("HABILIDADES DIGITALES", rightX, startY, { width: colWidth });
  const afterTitlesY = doc.y;
  doc.strokeColor(COLOR_LINE).lineWidth(0.5).moveTo(MARGIN, afterTitlesY + 3).lineTo(PAGE_WIDTH - MARGIN, afterTitlesY + 3).stroke();
  doc.strokeColor("#000").lineWidth(1);
  const contentStartY = afterTitlesY + 10;

  doc.fontSize(BODY_FONT_SIZE).font("Helvetica").fillColor(COLOR_BODY);
  const langLines = languages.length
    ? languages.map((l) => `${l?.language?.name ?? l?.language?.value ?? "—"}: ${l?.level?.name ?? l?.level?.value ?? "—"}${l?.certificationExam ? " (Examen)" : ""}`)
    : ["—"];
  doc.text(langLines.join("\n"), leftX, contentStartY, { width: colWidth, lineGap: 3 });
  const leftBottom = doc.y;
  doc.y = contentStartY;
  doc.text(safeStr(skillsText), rightX, contentStartY, { width: colWidth, lineGap: 3 });
  const rightBottom = doc.y;
  doc.y = Math.max(leftBottom, rightBottom);
  doc.moveDown(0.5);
}

/**
 * Genera el buffer del PDF de la hoja de vida.
 * @param {object} postulant - Postulante (postulantId populado con name, email)
 * @param {object} profileData - Respuesta de getPostulantProfileData
 * @param {object} parametrizacion - { logoBase64?, formatSecciones }
 * @returns {Promise<Buffer>}
 */
export async function buildHojaVidaPdf(postulant, profileData, parametrizacion) {
  // Resolvemos el logo antes de entrar al stream del PDFDocument (puede ser async por conversión SVG→PNG)
  const logoBuffer = await getLogoBuffer(parametrizacion?.logoBase64).catch((e) => {
    console.warn("[hojaVidaPdf] Error resolviendo logo:", e.message);
    return null;
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const y = MARGIN;
    const nameAreaX = logoBuffer ? MARGIN + LOGO_WIDTH + 16 : MARGIN;
    const nameAreaWidth = logoBuffer ? PAGE_WIDTH - MARGIN - nameAreaX : PAGE_WIDTH - 2 * MARGIN;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, y, { width: LOGO_WIDTH, height: LOGO_HEIGHT });
      } catch (e) {
        console.warn("[hojaVidaPdf] No se pudo dibujar el logo:", e.message);
      }
    }

    const user = postulant?.postulantId || postulant?.user;
    const fullName = safeStr(user?.name) || "Postulante";
    doc.fontSize(HEADER_NAME_FONT_SIZE).font("Helvetica-Bold").fillColor(COLOR_TITLE);
    doc.text(fullName, nameAreaX, y + 8, { align: "center", width: nameAreaWidth });
    doc.fontSize(HEADER_ROLE_FONT_SIZE).font("Helvetica").fillColor(COLOR_BODY);
    doc.text("Estudiante", nameAreaX, doc.y + 4, { align: "center", width: nameAreaWidth });
    const headerBottom = logoBuffer ? y + LOGO_HEIGHT : doc.y + 14;
    doc.y = Math.max(doc.y + 14, headerBottom);
    doc.moveDown(1.2);

    const contactIcons = loadContactIcons();
    const formatSecciones = (parametrizacion?.formatSecciones || []).filter((s) => s.visible).sort((a, b) => (a.order || 0) - (b.order || 0));

    for (const seccion of formatSecciones) {
      if (doc.y > 720) doc.addPage({ margin: MARGIN });
      const render = SECTION_RENDERERS[seccion.key];
      if (!render) continue;
      const sectionTitle = SECTION_TITLE_OVERRIDE[seccion.key] ?? (seccion.label || seccion.key).replace(/\([^)]*\)/g, "").trim().toUpperCase();
      drawSectionTitle(doc, sectionTitle);
      doc.fillColor(COLOR_BODY);
      if (seccion.key === "perfil" && (profileData?.languages?.length || profileData?.skills?.length || profileData?.postulantProfile?.skillsTechnicalSoftware)) {
        render(doc, profileData, postulant, { contactIcons });
        doc.moveDown(0.5);
        drawIdiomasYHabilidades(doc, profileData);
      } else {
        render(doc, profileData, postulant, { contactIcons });
      }
      doc.moveDown(1);
    }

    doc.end();
  });
}
