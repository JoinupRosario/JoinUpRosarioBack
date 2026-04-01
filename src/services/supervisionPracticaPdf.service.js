/**
 * PDF del informe de supervisión de práctica (RQ04_HU008).
 */
import PDFDocument from "pdfkit";

const MARGIN = 50;

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
 * @param {object} data - Campos del informe y firmas
 * @returns {Promise<Buffer>}
 */
export async function buildSupervisionPracticaPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#8B1538").text("Informe de supervisión de práctica", { align: "center" });
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(10).fillColor("#111");

    const tipo = data.tipoActividadSeguimiento === "final" ? "Seguimiento final" : "Seguimiento parcial";
    doc.text(`Tipo de actividad: ${tipo}`);
    doc.text(`Fecha: ${formatDate(data.fecha)}`);
    doc.text(`Tipo de seguimiento: ${safe(data.tipoSeguimientoMedio)}`);
    doc.moveDown(0.5);
    doc.text(`Producto o informe: ${safe(data.productoOInforme)}`);
    doc.text(`Ponderación (%): ${data.ponderacionPorcentaje != null ? data.ponderacionPorcentaje : "—"}`);
    doc.text(`Días-horas acumuladas (registro actividades): ${data.diasHorasAcumuladasAlMomento != null ? String(data.diasHorasAcumuladasAlMomento) : "—"}`);
    doc.text(`Nota registrada: ${data.nota != null ? String(data.nota) : "—"}`);
    doc.text(`Aprueba: ${data.aprueba ? "Sí" : "No"}`);
    doc.moveDown(0.5);
    doc.text(`Monitor: ${safe(data.monitorNombres)} ${safe(data.monitorApellidos)} — ${safe(data.monitorEmail)}`);
    doc.text(`Plan de estudios: ${safe(data.planEstudios)}`);
    doc.text(`Semestre: ${safe(data.semestre)}`);
    doc.text(`Correo institucional estudiante: ${safe(data.emailEstudiante)}`);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text("Observaciones:");
    doc.font("Helvetica").text(safe(data.observaciones), { align: "justify" });
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(9).text("Firmas electrónicas registradas", { underline: true });
    doc.font("Helvetica").fontSize(9);
    ["estudiante", "monitor", "tutor"].forEach((rol) => {
      const f = data.firmas?.[rol];
      const ok = f?.estado === "aprobado";
      doc.text(
        `${rol}: ${ok ? "Firmado" : "Pendiente"} ${f?.fecha ? `— ${formatDate(f.fecha)}` : ""}`
      );
    });

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor("#666").text(`Documento generado el ${formatDate(new Date())}. Universidad del Rosario.`, { align: "center" });

    doc.end();
  });
}
