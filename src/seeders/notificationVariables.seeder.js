import NotificationVariable from "../modules/notificacion/variablesNotificacion/variableNotificacion.model.js";

/**
 * Catálogo global de variables para plantillas de notificación (sin redundancias).
 * Una sola variable: comentario. Nombre entidad = nombre empresa (una sola). Resto igual.
 */
const VARIABLES = [
  { key: "NOMBRE_ENTIDAD", label: "Nombre de la entidad / empresa" },
  {
    key: "NUMERO_IDENTIFICACION",
    label: "Número de identificación",
    descripcion:
      "Número de documento según el contexto del correo: cédula o código del estudiante, NIT o cédula jurídica de la entidad, etc. Una sola variable [NUMERO_IDENTIFICACION] en plantillas.",
  },
  { key: "USUARIO", label: "Usuario (email o login)" },
  { key: "LINK", label: "Enlace / Link" },
  { key: "COMENTARIO", label: "Comentario" },
  { key: "NOMBRE_ESTUDIANTE", label: "Nombre del estudiante" },
  { key: "APELLIDO_ESTUDIANTE", label: "Apellido del estudiante" },
  { key: "CODIGO_ESTUDIANTE", label: "Código del estudiante" },
  {
    key: "TIPO_IDENTIFICACION",
    label: "Tipo de identificación",
    descripcion:
      "Clase de documento según contexto: cédula, NIT, pasaporte, tarjeta de identidad, cédula jurídica, etc. Complementa [NUMERO_IDENTIFICACION].",
  },
  { key: "NOMBRE_TUTOR", label: "Nombre del tutor" },
  { key: "PROGRAMA", label: "Programa académico" },
  { key: "PERIODO", label: "Período académico" },
  { key: "NOMBRE_FACULTAD", label: "Nombre facultad" },
  { key: "CURSO", label: "Curso" },
  { key: "ASIGNATURA", label: "Asignatura" },
  { key: "CATEGORIA", label: "Categoría" },
  { key: "TITULO_MONITORIA", label: "Título de monitoría/tutoría/mentoría" },
  { key: "TIPO_MONITORIA", label: "Tipo de monitoría/tutoría/mentoría" },
  { key: "NOMBRE_MONITORIA", label: "Nombre de la monitoría/tutoría/mentoría" },
  // NOMBRE_MTM: mismo uso práctico que NOMBRE_MONITORIA en flujos MTM del backend.
  { key: "NOMBRE_MTM", label: "Nombre MTM (cargo u oportunidad)" },
  { key: "LINK_APROBAR_PLAN", label: "Enlace para aprobar plan de trabajo (MTM)" },
  { key: "CODIGO_MONITORIA", label: "Código de monitoría" },
  { key: "HORAS", label: "Horas" },
  { key: "TITULO_OPORTUNIDAD", label: "Título oportunidad" },
  { key: "NOMBRE_OPORTUNIDAD", label: "Nombre de la oportunidad" },
  {
    key: "TIPO_OPORTUNIDAD",
    label: "Tipo de oportunidad (oferta)",
    descripcion:
      "Clasificación de la oferta según el campo `tipo` de la oportunidad en el sistema: práctica académica o monitoría (valores internos practica | monitoria, mostrar etiqueta legible al usuario). No confundir con la modalidad contractual del ítem tipoVinculacion.",
  },
  { key: "FUNCIONES", label: "Funciones" },
  {
    key: "MODALIDAD_VINCULACION",
    label: "Modalidad de vinculación (práctica)",
    descripcion:
      "Texto del ítem de tipo de vinculación contractual de la oferta (ref. tipoVinculacion, lista L_CONTRACT_TYPE_ACADEMIC_PRACTICE), p. ej. pasantía, convenio, acuerdo de vinculación. Solo aplica cuando la oferta es de práctica; no sustituye a [TIPO_OPORTUNIDAD]. Antes se llamaba en catálogo «TIPO_PRACTICA»; use solo esta clave en plantillas nuevas.",
  },
  { key: "FECHA", label: "Fecha" },
  { key: "FECHA_INICIO", label: "Fecha de inicio" },
  { key: "FECHA_FIN", label: "Fecha de fin" },
  { key: "CIUDAD", label: "Ciudad" },
  {
    key: "DIRECCION",
    label: "Dirección",
    descripcion: "Dirección de contacto o sede según el contexto del correo (entidad, sede de práctica, etc.).",
  },
  {
    key: "TELEFONO",
    label: "Teléfono",
    descripcion: "Teléfono de contacto según el contexto de la notificación.",
  },
  { key: "TIPO_ACTIVIDAD", label: "Tipo de actividad" },
  { key: "OBSERVACION", label: "Observación" },
  { key: "TITULO_DOCUMENTO_MONITORIA", label: "Título del documento de monitoría" },
  { key: "NOMBRE_DOCUMENTO", label: "Nombre del documento" },
  { key: "NOMBRE_DOCUMENTO_ADJUNTO", label: "Nombre del documento adjunto" },
  {
    key: "COMENTARIOS_RECHAZO_DOCUMENTOS",
    label: "Comentarios de rechazo de los documentos",
    descripcion: "Texto que el revisor dejó al rechazar documentos del estudiante o postulante.",
  },
  {
    key: "COMENTARIOS_RECHAZO_FORMULARIO_LEGALIZACION",
    label: "Comentarios de rechazo del formulario de legalización",
    descripcion: "Texto que el revisor dejó al rechazar el formulario de legalización.",
  },
  /** Contraseña inicial (única variable para credencial; el usuario/login va en USUARIO) */
  { key: "CONTRASENA_TEMPORAL", label: "Contraseña temporal / inicial" },
  /** Estado visible de la oportunidad o trámite (pendiente, aprobado, rechazado, etc.) */
  { key: "ESTADO_OPORTUNIDAD", label: "Estado de la oportunidad o del trámite" },
  /** Nota o calificación reportada */
  { key: "CALIFICACION", label: "Calificación o nota" },
  /** Conteo para avisos al líder (oportunidades pendientes de aprobación) */
  { key: "CANTIDAD_PENDIENTES_APROBACION", label: "Cantidad de ítems u oportunidades pendientes de aprobación" },
  /** Detalle de requisitos curriculares faltantes (una sola variable de texto) */
  { key: "DETALLE_REQUISITOS", label: "Detalle de requisitos no cumplidos o faltantes" },
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
          categoria: null,
        });
        created++;
      }
    }
    await NotificationVariable.updateMany(
      { key: { $in: [...KEYS_CANONICOS] } },
      { $set: { categoria: null } }
    );
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
