import DestinatarioNotificacion from "../modules/notificacion/destinatariosNotificacion/destinatarioNotificacion.model.js";

/**
 * Destinatarios posibles según IMPLEMENTACION_PLANTILLAS_NOTIFICACION.md:
 * "estudiantes, líderes de práctica, coordinadores, profesores/responsables MTM"
 * y de los eventos: Postulantes, Administradores, Monitor académico, etc.
 */
const DESTINATARIOS = [
  { key: "estudiante", label: "Estudiantes", descripcion: "Estudiantes / monitores", orden: 1 },
  { key: "coordinador", label: "Coordinadores", descripcion: "Coordinación de práctica o monitoría", orden: 2 },
  { key: "administrador", label: "Administradores", descripcion: "Administradores del sistema", orden: 3 },
  { key: "postulante", label: "Postulantes", descripcion: "Postulantes a oportunidad", orden: 4 },
  { key: "docente", label: "Docentes / Profesores", descripcion: "Profesores o responsables MTM", orden: 5 },
  { key: "lider_practica", label: "Líderes de práctica", descripcion: "Líder de práctica en la entidad", orden: 6 },
  { key: "monitor_academico", label: "Monitor académico", descripcion: "Monitor académico (MTM)", orden: 7 },
  { key: "tutor", label: "Tutores", descripcion: "Tutor de monitoría o práctica", orden: 8 },
];

export const seedDestinatariosNotificacion = async () => {
  try {
    let created = 0;
    for (const item of DESTINATARIOS) {
      const key = String(item.key).toLowerCase().trim();
      const exists = await DestinatarioNotificacion.findOne({ key });
      if (!exists) {
        await DestinatarioNotificacion.create({
          key,
          label: item.label,
          descripcion: item.descripcion || null,
          orden: item.orden ?? 0,
        });
        created++;
      }
    }
    if (created > 0) {
      console.log(`📧 DestinatariosNotificacion: ${created} destinatarios creados`);
    }
    return created;
  } catch (error) {
    console.error("❌ Error en seedDestinatariosNotificacion:", error.message);
    throw error;
  }
};
