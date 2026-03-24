/**
 * Utilidades para la tabla de firmas electrónicas del PDF (sin depender de acuerdoVinculacionPdf.service).
 */

export function formatFechaHoraPdfBogota(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    const s = date.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return `${s} (America/Bogota)`;
  } catch {
    return date.toISOString();
  }
}

/** Firmas “todas pendientes” para la primera generación del PDF. */
export function firmasTodasPendientes() {
  return {
    practicante: { estado: "pendiente" },
    escenario: { estado: "pendiente" },
    universidad: { estado: "pendiente" },
  };
}

/**
 * Filas para la tabla del PDF (orden: universidad, practicante, escenario).
 * @param {object} firmas - { practicante, escenario, universidad } con estado, fecha, ip, usuario, motivoRechazo
 * @param {object} payload - estudiante, escenario, universidad del armado del PDF
 * @param {Record<string, string>} emailById
 */
export function buildRegistroFirmasRows(firmas, payload, emailById = {}) {
  const { estudiante = {}, escenario = {}, universidad = {} } = payload || {};
  const orden = [
    {
      key: "universidad",
      parte: "Universidad del Rosario",
      nombreEsperado: universidad.representanteNombre || "—",
      obsPrefix: "Universidad",
    },
    {
      key: "practicante",
      parte: "Practicante",
      nombreEsperado: estudiante.nombreApellidos || "—",
      obsPrefix: "Estudiante",
    },
    {
      key: "escenario",
      parte: "Escenario de práctica",
      nombreEsperado: escenario.representanteLegalNombre || "—",
      obsPrefix: "Entidad",
    },
  ];

  return orden.map(({ key, parte, nombreEsperado, obsPrefix }) => {
    const slot = firmas?.[key] || {};
    const estado = slot.estado || "pendiente";
    let fechaHora = "—";
    if (slot.fecha && (estado === "aprobado" || estado === "rechazado")) {
      fechaHora = formatFechaHoraPdfBogota(slot.fecha);
    }
    let ip = "—";
    if (slot.ip != null && String(slot.ip).trim()) {
      const raw = String(slot.ip).trim();
      ip = raw.length > 56 ? `${raw.slice(0, 53)}…` : raw;
    }
    let observacion = "Pendiente de firma electrónica";
    if (estado === "aprobado") {
      const uid = slot.usuario != null ? String(slot.usuario) : "";
      const email = uid && emailById[uid] ? emailById[uid] : null;
      observacion = email
        ? `Aprobado por: ${obsPrefix}: ${email}`
        : "Aprobación electrónica registrada (sin sesión vinculada)";
    } else if (estado === "rechazado") {
      observacion = slot.motivoRechazo
        ? `Rechazo electrónico: ${String(slot.motivoRechazo).slice(0, 200)}`
        : "Rechazo electrónico";
    }
    return { parte, nombre: nombreEsperado, fechaHora, ip, observacion };
  });
}
