import ParametroPlantilla from "../modules/parametrosPlantilla/parametroPlantilla.model.js";

/**
 * Parámetros de plantilla de notificación.
 * tipo: general | practica | monitoria
 * value: código del evento (único por tipo)
 * nombre: etiqueta para la UI
 * variables: opcional, array { variable, desc } — las que el sistema reemplazará para esta plantilla
 *
 * Puedes definir variables por plantilla aquí; si no se ponen, el front mostrará una lista por defecto.
 */

// —— GENERAL (entidad, usuario, contraseña) ——
const VAR_GENERAL = [
  { variable: "[NOMBRE_ENTIDAD]", desc: "Nombre de la entidad" },
  { variable: "[USUARIO]", desc: "Usuario (email o login)" },
  { variable: "[LINK]", desc: "Enlace (ej. recuperar contraseña)" },
  { variable: "[COMENTARIO]", desc: "Comentario (si aplica)" },
];

// —— MONITORÍAS / TUTORÍAS / MENTORÍAS: variables por notificación ——
const VAR_MTM_ACEPTACION_OFERTA = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[TITULO_MONITORIA]", desc: "Título de monitoría/tutoría/mentoría" },
];

const VAR_MTM_RECHAZO_OFERTA = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[PROGRAMA]", desc: "Programa" },
  { variable: "[TITULO_MONITORIA]", desc: "Título de monitoría/tutoría/mentoría" },
];

const VAR_MTM_APROBACION_POSTULANTE_OPORTUNIDAD = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[NOMBRE_OPORTUNIDAD]", desc: "Nombre de la oportunidad" },
  { variable: "[FUNCIONES]", desc: "Funciones" },
  { variable: "[LINK]", desc: "Link para que acepte la oportunidad" },
];

const VAR_MTM_RECHAZO_POSTULANTE_OPORTUNIDAD = [
  { variable: "[TITULO_OPORTUNIDAD]", desc: "Título oportunidad" },
];

const VAR_MTM_ACEPTACION_LEGALIZACION = [
  { variable: "[TITULO_MONITORIA]", desc: "Título de monitoría" },
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[LINK]", desc: "Link" },
];

const VAR_MTM_ENVIO_REVISION_LEGALIZACION = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[PROGRAMA]", desc: "Programa" },
  { variable: "[CEDULA]", desc: "Cédula" },
  { variable: "[PERIODO]", desc: "Período" },
  { variable: "[TIPO_MONITORIA]", desc: "Tipo de monitoría/tutoría/mentoría" },
  { variable: "[FUNCIONES]", desc: "Funciones" },
  { variable: "[LINK]", desc: "Link" },
];

const VAR_MTM_APROBACION_LEGALIZACION_ESTUDIANTES = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[TITULO_MONITORIA]", desc: "Título de monitoría" },
  { variable: "[PROGRAMA]", desc: "Programa" },
  { variable: "[PERIODO]", desc: "Período" },
  { variable: "[TIPO_MONITORIA]", desc: "Tipo de monitoría/tutoría/mentoría" },
  { variable: "[NOMBRE_MONITORIA]", desc: "Nombre de la monitoría/tutoría/mentoría" },
];

const VAR_MTM_RECHAZO_LEGALIZACION_ESTUDIANTES = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[TITULO_MONITORIA]", desc: "Título de monitoría" },
  { variable: "[PROGRAMA]", desc: "Programa" },
  { variable: "[PERIODO]", desc: "Período" },
  { variable: "[TIPO_MONITORIA]", desc: "Tipo de monitoría/tutoría/mentoría" },
  { variable: "[NOMBRE_MONITORIA]", desc: "Nombre de la monitoría/tutoría/mentoría" },
  { variable: "[COMENTARIOS_RECHAZO_DOCUMENTOS]", desc: "Comentarios de rechazo de los documentos" },
  { variable: "[COMENTARIOS_RECHAZO_FORMULARIO_LEGALIZACION]", desc: "Comentarios de rechazo del formulario de legalización" },
];

const VAR_MTM_RECHAZO_DOCUMENTO_LEGALIZACION = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[TITULO_DOCUMENTO_MONITORIA]", desc: "Título del documento de monitoría" },
  { variable: "[NOMBRE_DOCUMENTO]", desc: "Nombre del documento" },
  { variable: "[NOMBRE_DOCUMENTO_ADJUNTO]", desc: "Nombre del documento adjunto" },
  { variable: "[OBSERVACION]", desc: "Observación" },
];

const VAR_MTM_APROBACION_SEGUIMIENTO = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[TIPO_ACTIVIDAD]", desc: "Tipo de actividad" },
  { variable: "[FECHA_ACTIVIDAD]", desc: "Fecha de la actividad" },
  { variable: "[OBSERVACION_ACTIVIDAD]", desc: "Observación de la actividad" },
];

const VAR_MTM_CREACION_SEGUIMIENTO_REQUIERE_APROBACION = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[PROGRAMA]", desc: "Programa" },
  { variable: "[TIPO_ACTIVIDAD]", desc: "Tipo de actividad" },
  { variable: "[FECHA_ACTIVIDAD]", desc: "Fecha de actividad" },
  { variable: "[OBSERVACION_ACTIVIDAD]", desc: "Observación actividad" },
];

const VAR_MTM_CREACION_PLAN_TRABAJO = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[FECHA_INICIAL_PERIODO]", desc: "Fecha inicial período académico" },
  { variable: "[LINK]", desc: "Link" },
];

const VAR_MTM_APROBACION_PLAN_TRABAJO = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[TITULO_MONITORIA]", desc: "Título monitoría" },
];

const VAR_MTM_RECHAZO_SEGUIMIENTO = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[TIPO_ACTIVIDAD]", desc: "Tipo actividad" },
  { variable: "[FECHA_ACTIVIDAD]", desc: "Fecha actividad" },
  { variable: "[OBSERVACION_ACTIVIDAD]", desc: "Observación actividad" },
];

const VAR_MTM_EVALUACION_COORDINADOR = [
  { variable: "[NOMBRE_TUTOR]", desc: "Nombre del tutor" },
  { variable: "[PERIODO]", desc: "Período" },
  { variable: "[LINK]", desc: "Link" },
];

const VAR_MTM_EVALUACION_ESTUDIANTE_MONITOR = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[CATEGORIA]", desc: "Categoría" },
  { variable: "[CURSO]", desc: "Curso" },
  { variable: "[LINK]", desc: "Link" },
];

const VAR_MTM_EVALUACION_DOCENTE = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre postulante" },
  { variable: "[LINK]", desc: "Link" },
  { variable: "[TIPO_MONITORIA]", desc: "Tipo de monitoría" },
  { variable: "[CURSO]", desc: "Curso" },
];

const VAR_MTM_CIERRE_LEGALIZACION = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
];

const VAR_MTM_SOLICITUD_CIERRE = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
];

const VAR_MTM_SOLICITUD_CERTIFICADO = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[NOMBRE_FACULTAD]", desc: "Nombre facultad" },
  { variable: "[PERIODO]", desc: "Período" },
  { variable: "[IDENTIFICACION_POSTULANTE]", desc: "Identificación postulante" },
  { variable: "[TIPO_IDENTIFICACION]", desc: "Tipo de identificación" },
  { variable: "[TIPO_MONITORIA]", desc: "Tipo de monitoría" },
  { variable: "[HORAS]", desc: "Horas" },
  { variable: "[ASIGNATURA]", desc: "Asignatura" },
  { variable: "[NOMBRE_TUTOR]", desc: "Nombre del tutor" },
];

const VAR_MTM_LINK_EVALUACION_ESTUDIANTES = [
  { variable: "[NOMBRE_POSTULANTE]", desc: "Nombre del postulante" },
  { variable: "[LINK]", desc: "Link" },
  { variable: "[CODIGO_MONITORIA]", desc: "Código de monitoría" },
];

const VAR_MTM_LINK_ASISTENCIA_MONITOR = [
  { variable: "[LINK]", desc: "Link" },
];

// —— PRÁCTICA: se actualizarán cuando tengas el listado (por ahora se mantienen genéricos) ——
const VAR_LEGALIZACION = [
  { variable: "[NOMBRE_ESTUDIANTE]", desc: "Nombre del estudiante" },
  { variable: "[APELLIDO_ESTUDIANTE]", desc: "Apellido del estudiante" },
  { variable: "[CODIGO_ESTUDIANTE]", desc: "Código del estudiante" },
  { variable: "[PROGRAMA]", desc: "Nombre del programa académico" },
  { variable: "[PERIODO]", desc: "Período académico" },
  { variable: "[EMPRESA]", desc: "Nombre de la entidad / empresa" },
  { variable: "[TIPO_PRACTICA]", desc: "Tipo de práctica" },
  { variable: "[FECHA_INICIO]", desc: "Fecha de inicio" },
  { variable: "[FECHA_FIN]", desc: "Fecha de fin" },
  { variable: "[CIUDAD]", desc: "Ciudad" },
  { variable: "[LINK]", desc: "Enlace (ej. a documentos o pantalla)" },
  { variable: "[COMENTARIO]", desc: "Comentario u observación (si aplica)" },
];

const VAR_OFERTA_POSTULANTE = [
  { variable: "[NOMBRE_ESTUDIANTE]", desc: "Nombre del estudiante" },
  { variable: "[APELLIDO_ESTUDIANTE]", desc: "Apellido del estudiante" },
  { variable: "[CODIGO_ESTUDIANTE]", desc: "Código del estudiante" },
  { variable: "[PROGRAMA]", desc: "Programa académico" },
  { variable: "[PERIODO]", desc: "Período académico" },
  { variable: "[EMPRESA]", desc: "Entidad / empresa" },
  { variable: "[NOMBRE_OPORTUNIDAD]", desc: "Nombre de la oportunidad" },
  { variable: "[LINK]", desc: "Enlace" },
];

const VAR_EVALUACION = [
  { variable: "[NOMBRE_ESTUDIANTE]", desc: "Nombre del estudiante" },
  { variable: "[APELLIDO_ESTUDIANTE]", desc: "Apellido del estudiante" },
  { variable: "[PROGRAMA]", desc: "Programa académico" },
  { variable: "[PERIODO]", desc: "Período académico" },
  { variable: "[LINK]", desc: "Enlace a evaluación o formulario" },
];

const PARAMETROS = [
  // ---- GENERAL ----
  { value: "registro_entidad", tipo: "general", nombre: "Registro de entidad", variables: VAR_GENERAL },
  { value: "envio_usuario_contrasena_entidad", tipo: "general", nombre: "Envío de usuario y contraseña a entidad", variables: VAR_GENERAL },
  { value: "recuperar_contrasena", tipo: "general", nombre: "Recuperación de contraseña", variables: VAR_GENERAL },
  { value: "bienvenida_usuario", tipo: "general", nombre: "Bienvenida a usuario del sistema", variables: VAR_GENERAL },

  // ---- MONITORÍA (Monitorías, Tutorías, Mentorías) ----
  { value: "aceptacion_oferta_por_estudiante", tipo: "monitoria", nombre: "Posterior a la aceptación de oferta por parte del estudiante (Coordinador)", variables: VAR_MTM_ACEPTACION_OFERTA },
  { value: "rechazo_oferta_por_estudiante", tipo: "monitoria", nombre: "Posterior al rechazo de la oferta por parte del estudiante (Coordinador)", variables: VAR_MTM_RECHAZO_OFERTA },
  { value: "aprobacion_postulante_por_oportunidad", tipo: "monitoria", nombre: "Posterior a la aprobación de un postulante por parte de la oportunidad (Postulantes)", variables: VAR_MTM_APROBACION_POSTULANTE_OPORTUNIDAD },
  { value: "rechazo_postulante_por_oportunidad", tipo: "monitoria", nombre: "Posterior al rechazo de un postulante por parte de la oportunidad (Postulantes)", variables: VAR_MTM_RECHAZO_POSTULANTE_OPORTUNIDAD },
  { value: "aceptacion_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior a la aceptación de una legalización de monitoría (Estudiantes, Administradores)", variables: VAR_MTM_ACEPTACION_LEGALIZACION },
  { value: "envio_revision_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al envío a revisión de una legalización de monitoría (Administradores)", variables: VAR_MTM_ENVIO_REVISION_LEGALIZACION },
  { value: "aprobacion_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior a la aprobación de una legalización de monitoría (Estudiantes)", variables: VAR_MTM_APROBACION_LEGALIZACION_ESTUDIANTES },
  { value: "rechazo_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al rechazo de una legalización de monitoría (Estudiantes)", variables: VAR_MTM_RECHAZO_LEGALIZACION_ESTUDIANTES },
  { value: "rechazo_documento_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al rechazo de un documento de legalización de monitoría (Estudiantes)", variables: VAR_MTM_RECHAZO_DOCUMENTO_LEGALIZACION },
  { value: "aprobacion_seguimiento_monitoria", tipo: "monitoria", nombre: "Posterior a la aprobación de un seguimiento de monitoría (Estudiante)", variables: VAR_MTM_APROBACION_SEGUIMIENTO },
  { value: "creacion_seguimiento_monitoria_requiere_aprobacion", tipo: "monitoria", nombre: "Posterior a la creación de un seguimiento de monitoría que requiere aprobación (Administradores)", variables: VAR_MTM_CREACION_SEGUIMIENTO_REQUIERE_APROBACION },
  { value: "creacion_plan_trabajo_monitoria", tipo: "monitoria", nombre: "Posterior a la creación de un plan de trabajo de monitoría (Administradores)", variables: VAR_MTM_CREACION_PLAN_TRABAJO },
  { value: "aprobacion_plan_trabajo_monitoria", tipo: "monitoria", nombre: "Posterior a la aprobación de un plan de trabajo de monitoría (Estudiantes)", variables: VAR_MTM_APROBACION_PLAN_TRABAJO },
  { value: "rechazo_seguimiento_monitoria", tipo: "monitoria", nombre: "Posterior al rechazo de un seguimiento de monitoría (Estudiantes)", variables: VAR_MTM_RECHAZO_SEGUIMIENTO },
  { value: "envio_evaluacion_coordinador", tipo: "monitoria", nombre: "Al momento del envío de la evaluación para el coordinador", variables: VAR_MTM_EVALUACION_COORDINADOR },
  { value: "envio_evaluacion_estudiante_monitor", tipo: "monitoria", nombre: "Al momento del envío de la evaluación para el estudiante/monitor", variables: VAR_MTM_EVALUACION_ESTUDIANTE_MONITOR },
  { value: "envio_evaluacion_docente", tipo: "monitoria", nombre: "Al momento del envío de la evaluación para el docente", variables: VAR_MTM_EVALUACION_DOCENTE },
  { value: "cierre_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al cierre de una legalización de monitoría", variables: VAR_MTM_CIERRE_LEGALIZACION },
  { value: "solicitud_cierre_monitoria", tipo: "monitoria", nombre: "Posterior a la solicitud de cierre de la monitoría (Coordinador)", variables: VAR_MTM_SOLICITUD_CIERRE },
  { value: "solicitud_certificado_monitoria", tipo: "monitoria", nombre: "Al solicitar certificado de monitoría", variables: VAR_MTM_SOLICITUD_CERTIFICADO },
  { value: "envio_link_evaluacion_estudiantes", tipo: "monitoria", nombre: "Al momento del envío de link de evaluación para estudiantes (Monitor académico)", variables: VAR_MTM_LINK_EVALUACION_ESTUDIANTES },
  { value: "envio_link_asistencia_monitor", tipo: "monitoria", nombre: "Al enviar link de asistencia a monitor (Estudiante)", variables: VAR_MTM_LINK_ASISTENCIA_MONITOR },

  // ---- PRÁCTICA (sin variables por ahora) ----
  { value: "aceptacion_oferta_por_estudiante", tipo: "practica", nombre: "Posterior a la aceptación de oferta por parte del estudiante (Coordinador)" },
  { value: "rechazo_oferta_por_estudiante", tipo: "practica", nombre: "Posterior al rechazo de la oferta por parte del estudiante (Coordinador)" },
  { value: "aprobacion_postulante_por_oportunidad", tipo: "practica", nombre: "Posterior a la aprobación de un postulante por parte de la oportunidad (Postulantes)" },
  { value: "rechazo_postulante_por_oportunidad", tipo: "practica", nombre: "Posterior al rechazo de un postulante por parte de la oportunidad (Postulantes)" },
  { value: "aceptacion_legalizacion_practica", tipo: "practica", nombre: "Posterior a la aceptación de una legalización de práctica (Estudiantes, Administradores)" },
  { value: "envio_revision_legalizacion_practica", tipo: "practica", nombre: "Posterior al envío a revisión de una legalización de práctica (Administradores)" },
  { value: "aprobacion_legalizacion_practica", tipo: "practica", nombre: "Posterior a la aprobación de una legalización de práctica (Estudiantes)" },
  { value: "rechazo_legalizacion_practica", tipo: "practica", nombre: "Posterior al rechazo de una legalización de práctica (Estudiantes)" },
  { value: "rechazo_documento_legalizacion_practica", tipo: "practica", nombre: "Posterior al rechazo de un documento de legalización de práctica (Estudiantes)" },
  { value: "aprobacion_seguimiento_practica", tipo: "practica", nombre: "Posterior a la aprobación de un seguimiento de práctica (Estudiante)" },
  { value: "creacion_seguimiento_practica_requiere_aprobacion", tipo: "practica", nombre: "Posterior a la creación de un seguimiento de práctica que requiere aprobación (Administradores)" },
  { value: "creacion_plan_trabajo_practica", tipo: "practica", nombre: "Posterior a la creación de un plan de trabajo de práctica (Administradores)" },
  { value: "aprobacion_plan_trabajo_practica", tipo: "practica", nombre: "Posterior a la aprobación de un plan de trabajo de práctica (Estudiantes)" },
  { value: "rechazo_seguimiento_practica", tipo: "practica", nombre: "Posterior al rechazo de un seguimiento de práctica (Estudiantes)" },
  { value: "envio_evaluacion_coordinador", tipo: "practica", nombre: "Al momento del envío de la evaluación para el coordinador" },
  { value: "envio_evaluacion_estudiante", tipo: "practica", nombre: "Al momento del envío de la evaluación para el estudiante" },
  { value: "envio_evaluacion_docente", tipo: "practica", nombre: "Al momento del envío de la evaluación para el docente/líder" },
  { value: "cierre_legalizacion_practica", tipo: "practica", nombre: "Posterior al cierre de una legalización de práctica" },
  { value: "solicitud_cierre_practica", tipo: "practica", nombre: "Posterior a la solicitud de cierre de la práctica (Coordinador)" },
  { value: "solicitud_certificado_practica", tipo: "practica", nombre: "Al solicitar certificado de práctica" },
  { value: "envio_link_evaluacion_estudiantes", tipo: "practica", nombre: "Al momento del envío de link de evaluación para estudiantes" },
  { value: "envio_link_asistencia_practica", tipo: "practica", nombre: "Al enviar link de asistencia (Práctica)" },
];

export const seedParametrosPlantilla = async () => {
  try {
    let created = 0;
    let updated = 0;
    for (const item of PARAMETROS) {
      const exists = await ParametroPlantilla.findOne({
        value: item.value,
        tipo: item.tipo,
      });
      if (!exists) {
        await ParametroPlantilla.create(item);
        created++;
      } else if (item.variables && item.variables.length > 0) {
        await ParametroPlantilla.updateOne(
          { _id: exists._id },
          { $set: { variables: item.variables } }
        );
        updated++;
      } else {
        // Sin variables en el ítem (ej. práctica): dejar array vacío en la BD
        await ParametroPlantilla.updateOne(
          { _id: exists._id },
          { $set: { variables: [] } }
        );
        updated++;
      }
    }
    if (created > 0) console.log(`📧 ParametrosPlantilla: ${created} parámetros creados`);
    if (updated > 0) console.log(`📧 ParametrosPlantilla: ${updated} parámetros actualizados`);
    return created + updated;
  } catch (error) {
    console.error("❌ Error en seedParametrosPlantilla:", error.message);
    throw error;
  }
};
