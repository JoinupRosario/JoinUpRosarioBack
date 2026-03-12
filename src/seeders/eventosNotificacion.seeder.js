import dotenv from "dotenv";
import connectDB from "../config/db.js";
import Evento from "../modules/notificacion/eventos/evento.model.js";

dotenv.config();

/**
 * Eventos de notificación. Se persisten en la colección "eventos" (eventoSchema).
 * tipo: general | practica | monitoria
 * value: código único del evento por tipo
 * nombre: etiqueta para la UI (estilo "Posterior a...")
 */
const EVENTOS = [
  // ---- GENERAL ----
  { value: "registro_entidad", tipo: "general", nombre: "Posterior al registro de entidad en el sistema" },
  { value: "envio_usuario_contrasena_entidad", tipo: "general", nombre: "Posterior al envío de usuario y contraseña a entidad" },
  { value: "creacion_tutores", tipo: "general", nombre: "Posterior a la creación de tutores" },

  // ---- PRÁCTICA ----
  { value: "creacion_oportunidad", tipo: "practica", nombre: "Posterior a la creación de oportunidad" },
  { value: "activacion_rechazo_oportunidad", tipo: "practica", nombre: "Posterior a la activación o rechazo de oportunidad" },
  { value: "aceptacion_inscripcion_oportunidad_estudiantes", tipo: "practica", nombre: "Posterior a la aceptación a inscripción de la oportunidad a estudiantes" },
  { value: "no_aceptacion_inscripcion_oportunidad_estudiantes", tipo: "practica", nombre: "Posterior a la no aceptación a inscripción de la oportunidad a estudiantes" },
  { value: "postulacion_estudiantes_entidad_lideres", tipo: "practica", nombre: "Posterior a la postulación de estudiantes" },
  { value: "notificacion_resultados_postulacion_estudiantes", tipo: "practica", nombre: "Posterior a la notificación de resultados de postulación de estudiantes" },
  { value: "forma_vinculacion_entidad", tipo: "practica", nombre: "Posterior a la forma de vinculación entidad" },
  { value: "forma_vinculacion_estudiante", tipo: "practica", nombre: "Posterior a la forma de vinculación estudiante" },
  { value: "carta_presentacion_preliminar", tipo: "practica", nombre: "Posterior a la carta de presentación preliminar" },
  { value: "carta_presentacion_definitiva", tipo: "practica", nombre: "Posterior a la carta de presentación definitiva" },
  { value: "notificacion_ingreso_documento_vinculacion", tipo: "practica", nombre: "Posterior a la notificación de ingreso del documento de vinculación" },
  { value: "notificacion_afiliacion_arl", tipo: "practica", nombre: "Posterior a la notificación de afiliación ARL" },
  { value: "notificacion_tutor", tipo: "practica", nombre: "Posterior a la notificación a tutor" },
  { value: "notificacion_monitor", tipo: "practica", nombre: "Posterior a la notificación a monitor" },
  { value: "aprobacion_plan_practica", tipo: "practica", nombre: "Posterior a la aprobación del Plan de Práctica" },
  { value: "plan_practica_aprobado_firmado", tipo: "practica", nombre: "Posterior al Plan de práctica aprobado y firmado" },
  { value: "aprobacion_productos_seguimiento_estudiante", tipo: "practica", nombre: "Posterior a la aprobación de productos de seguimiento del estudiante" },
  { value: "aprobacion_informe_final_practica_pasantia", tipo: "practica", nombre: "Posterior a la aprobación del informe final de práctica-pasantía" },
  { value: "solicitud_certificacion_practica", tipo: "practica", nombre: "Posterior a la solicitud de certificación de práctica" },
  { value: "inscripcion_oportunidades", tipo: "practica", nombre: "Posterior a la inscripción a oportunidades" },
  { value: "aprobacion_inscripcion_oportunidad_estudiante_entidad", tipo: "practica", nombre: "Posterior a la aprobación de inscripción de la oportunidad" },
  { value: "notificacion_oportunidad_proxima_vencimiento_entidad", tipo: "practica", nombre: "Posterior a la notificación de oportunidad próxima a vencerse" },
  { value: "notificacion_oportunidad_vencida_cierre_entidad", tipo: "practica", nombre: "Posterior a la notificación cuando la oportunidad está vencida para que la entidad la cierre" },
  { value: "notificacion_oportunidades_pendientes_aprobacion_lider", tipo: "practica", nombre: "Posterior a la notificación de oportunidades pendientes de aprobación" },
  { value: "falta_cumplimiento_requisitos_curriculares_inscripcion", tipo: "practica", nombre: "Posterior a la falta de cumplimiento de requisitos curriculares a inscripción de la oportunidad" },
  { value: "actualizacion_estado_oportunidad", tipo: "practica", nombre: "Posterior a la actualización de estado a oportunidad (Pendiente, aprobado, rechazado, etc.)" },
  { value: "reporte_nota", tipo: "practica", nombre: "Posterior al reporte de nota" },
  { value: "notificacion_no_creacion_oportunidad", tipo: "practica", nombre: "Posterior a la notificación de no creación de oportunidad" },
  { value: "notificacion_entidad_estudiante_no_continua", tipo: "practica", nombre: "Posterior a la configuración de notificación a entidades de que el estudiante no continuará en el proceso al que se presentó (seleccionado por otra entidad)" },
  { value: "actualizacion_estado_oportunidad_aceptacion_rechazo_entidad", tipo: "practica", nombre: "Posterior a la actualización de estado a oportunidad (aceptación o rechazo) para la entidad" },
  { value: "envio_hojas_vida_estudiante_entidad", tipo: "practica", nombre: "Posterior al envío de hojas de vida de estudiante a entidad" },

  // ---- MONITORÍA (MTM: 22 eventos) ----
  { value: "notificacion_monitor", tipo: "monitoria", nombre: "Posterior a la notificación a monitor" },
  { value: "aceptacion_oferta_por_estudiante", tipo: "monitoria", nombre: "Posterior a la aceptación de oferta por parte del estudiante" },
  { value: "rechazo_oferta_por_estudiante", tipo: "monitoria", nombre: "Posterior al rechazo de la oferta por parte del estudiante" },
  { value: "aprobacion_postulante_por_oportunidad", tipo: "monitoria", nombre: "Posterior a la aprobación de un postulante por parte de la oportunidad" },
  { value: "rechazo_postulante_por_oportunidad", tipo: "monitoria", nombre: "Posterior al rechazo de un postulante por parte de la oportunidad" },
  { value: "aceptacion_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior a la aceptación de una legalización de Monitoría" },
  { value: "envio_revision_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al envío a revisión de una legalización de Monitoría" },
  { value: "aprobacion_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior a la aprobación de una legalización de una monitoría" },
  { value: "rechazo_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al rechazo de una legalización de una monitoría" },
  { value: "rechazo_documento_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al rechazo de un documento de una legalización de monitoría" },
  { value: "aprobacion_seguimiento_monitoria", tipo: "monitoria", nombre: "Posterior a la aprobación de un seguimiento de monitoría" },
  { value: "creacion_seguimiento_monitoria_requiere_aprobacion", tipo: "monitoria", nombre: "Posterior a la creación de un seguimiento de monitoría que requiere aprobación" },
  { value: "creacion_plan_trabajo_monitoria", tipo: "monitoria", nombre: "Posterior a la creación de un plan de trabajo de monitoría" },
  { value: "aprobacion_plan_trabajo_monitoria", tipo: "monitoria", nombre: "Posterior a la aprobación de un plan de trabajo de monitoría" },
  { value: "rechazo_seguimiento_monitoria", tipo: "monitoria", nombre: "Posterior al rechazo de un seguimiento de monitoría" },
  { value: "envio_evaluacion_coordinador", tipo: "monitoria", nombre: "Al momento del envío de la evaluación para el coordinador" },
  { value: "envio_evaluacion_estudiante_monitor", tipo: "monitoria", nombre: "Al momento del envío de la evaluación para el estudiante/monitor" },
  { value: "envio_evaluacion_docente", tipo: "monitoria", nombre: "Al momento del envío de la evaluación para el docente" },
  { value: "cierre_legalizacion_monitoria", tipo: "monitoria", nombre: "Posterior al cierre de una legalización de monitoría" },
  { value: "solicitud_cierre_monitoria", tipo: "monitoria", nombre: "Posterior a la solicitud de cierre de la monitoría" },
  { value: "solicitud_certificado_monitoria", tipo: "monitoria", nombre: "Al solicitar certificado de monitoría" },
  { value: "envio_link_evaluacion_estudiantes", tipo: "monitoria", nombre: "Al momento del envío de link de evaluación para estudiantes" },
  { value: "envio_link_asistencia_monitor", tipo: "monitoria", nombre: "Al enviar link de asistencia a monitor" },
];

export const seedEventosNotificacion = async () => {
  try {
    let created = 0;
    for (const item of EVENTOS) {
      const exists = await Evento.findOne({
        value: item.value,
        tipo: item.tipo,
      });
      if (!exists) {
        await Evento.create({
          value: item.value,
          tipo: item.tipo,
          nombre: item.nombre,
          variables: [],
        });
        created++;
      }
    }
    if (created > 0) console.log(`📧 Eventos (eventosSchema): ${created} eventos creados`);
    return created;
  } catch (error) {
    console.error("❌ Error en seedEventosNotificacion:", error.message);
    throw error;
  }
};

// Ejecutar si se invoca directamente (npm run seed:eventos-notificacion)
const isRunDirect = process.argv[1]?.endsWith("eventosNotificacion.seeder.js");
if (isRunDirect) {
  (async () => {
    try {
      await connectDB();
      await seedEventosNotificacion();
      console.log("🎉 Eventos (eventoSchema): seeder finalizado");
      process.exit(0);
    } catch (e) {
      console.error("💥 Error:", e.message);
      process.exit(1);
    }
  })();
}
