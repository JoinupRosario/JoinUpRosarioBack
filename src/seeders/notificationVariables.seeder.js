import NotificationVariable from "../modules/notificacion/variablesNotificacion/variableNotificacion.model.js";

/**
 * Catálogo global de variables para plantillas de notificación (sin redundancias).
 * Una sola variable: comentario. Nombre entidad = nombre empresa (una sola). Resto igual.
 */
const VARIABLES = [
  { key: "NOMBRE_ENTIDAD", label: "Nombre de la entidad / empresa", categoria: "general" },
  { key: "USUARIO", label: "Usuario (email o login)", categoria: "general" },
  { key: "LINK", label: "Enlace / Link", categoria: "general" },
  { key: "COMENTARIO", label: "Comentario", categoria: "general" },
  { key: "NOMBRE_ESTUDIANTE", label: "Nombre del estudiante", categoria: "persona" },
  { key: "APELLIDO_ESTUDIANTE", label: "Apellido del estudiante", categoria: "persona" },
  { key: "IDENTIFICACION_ESTUDIANTE", label: "Identificación del estudiante (cédula)", categoria: "persona" },
  { key: "CODIGO_ESTUDIANTE", label: "Código del estudiante", categoria: "persona" },
  { key: "TIPO_IDENTIFICACION", label: "Tipo de identificación", categoria: "persona" },
  { key: "NOMBRE_TUTOR", label: "Nombre del tutor", categoria: "persona" },
  { key: "PROGRAMA", label: "Programa académico", categoria: "academico" },
  { key: "PERIODO", label: "Período académico", categoria: "academico" },
  { key: "NOMBRE_FACULTAD", label: "Nombre facultad", categoria: "academico" },
  { key: "CURSO", label: "Curso", categoria: "academico" },
  { key: "ASIGNATURA", label: "Asignatura", categoria: "academico" },
  { key: "CATEGORIA", label: "Categoría", categoria: "academico" },
  { key: "TITULO_MONITORIA", label: "Título de monitoría/tutoría/mentoría", categoria: "monitoria" },
  { key: "TIPO_MONITORIA", label: "Tipo de monitoría/tutoría/mentoría", categoria: "monitoria" },
  { key: "NOMBRE_MONITORIA", label: "Nombre de la monitoría/tutoría/mentoría", categoria: "monitoria" },
  { key: "CODIGO_MONITORIA", label: "Código de monitoría", categoria: "monitoria" },
  { key: "HORAS", label: "Horas", categoria: "monitoria" },
  { key: "TITULO_OPORTUNIDAD", label: "Título oportunidad", categoria: "oportunidad" },
  { key: "NOMBRE_OPORTUNIDAD", label: "Nombre de la oportunidad", categoria: "oportunidad" },
  { key: "FUNCIONES", label: "Funciones", categoria: "oportunidad" },
  { key: "TIPO_PRACTICA", label: "Tipo de práctica", categoria: "practica" },
  { key: "FECHA", label: "Fecha", categoria: "fechas" },
  { key: "FECHA_INICIO", label: "Fecha de inicio", categoria: "fechas" },
  { key: "FECHA_FIN", label: "Fecha de fin", categoria: "fechas" },
  { key: "CIUDAD", label: "Ciudad", categoria: "ubicacion" },
  { key: "TIPO_ACTIVIDAD", label: "Tipo de actividad", categoria: "seguimiento" },
  { key: "OBSERVACION", label: "Observación", categoria: "seguimiento" },
  { key: "TITULO_DOCUMENTO_MONITORIA", label: "Título del documento de monitoría", categoria: "documento" },
  { key: "NOMBRE_DOCUMENTO", label: "Nombre del documento", categoria: "documento" },
  { key: "NOMBRE_DOCUMENTO_ADJUNTO", label: "Nombre del documento adjunto", categoria: "documento" },
];

const KEYS_CANONICOS = new Set(VARIABLES.map((v) => String(v.key).toUpperCase().trim()));

export const seedNotificationVariables = async () => {
  try {
    let created = 0;
    for (const item of VARIABLES) {
      const key = String(item.key).toUpperCase().trim();
      const exists = await NotificationVariable.findOne({ key });
      if (!exists) {
        await NotificationVariable.create({
          key,
          label: item.label || key,
          descripcion: item.descripcion || null,
          categoria: item.categoria || null,
        });
        created++;
      }
    }
    const deleted = await NotificationVariable.deleteMany({
      key: { $nin: [...KEYS_CANONICOS] },
    });
    if (deleted.deletedCount > 0) {
      console.log(`📧 NotificationVariables: ${deleted.deletedCount} variables obsoletas eliminadas`);
    }
    if (created > 0) {
      console.log(`📧 NotificationVariables: ${created} variables creadas`);
    }
    return created;
  } catch (error) {
    console.error("❌ Error en seedNotificationVariables:", error.message);
    throw error;
  }
};
