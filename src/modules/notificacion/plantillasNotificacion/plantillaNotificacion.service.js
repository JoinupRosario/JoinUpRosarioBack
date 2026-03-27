/**
 * Servicio para ejecutar notificaciones al dispararse un evento.
 * Obtiene la plantilla activa del evento, reemplaza variables con datos reales
 * y devuelve el contenido listo para enviar (ej. por correo).
 */
import PlantillaNotificacion from "./plantillaNotificacion.model.js";
import { renderPlantilla } from "./plantillaNotificacion.utils.js";

/**
 * Obtiene la plantilla activa para un evento (parametro_plantilla) y la renderiza con los datos.
 * Útil cuando se ejecuta un evento del sistema (ej. "envío a revisión de legalización").
 *
 * @param {string|ObjectId} parametroPlantillaId - ID del evento (Evento)
 * @param {Record<string, string|number|null|undefined>} datos - Mapa de variables a valores reales. Keys en mayúsculas (ej. NOMBRE_POSTULANTE, LINK).
 * @returns {Promise<{ asunto: string, cuerpo: string, plantillaId: string, destinatarioKeys: string[] }|null>} Contenido renderizado o null si no hay plantilla activa
 */
export async function getRenderedActivePlantilla(parametroPlantillaId, datos = {}) {
  const plantilla = await PlantillaNotificacion.findOne({
    parametroPlantillaId,
    isActive: true,
  }).lean();
  if (!plantilla) return null;
  const rendered = renderPlantilla(plantilla.asunto, plantilla.cuerpo, datos);
  const destinatarioKeys = [...(plantilla.destinatarios || [])]
    .map((k) => String(k).toLowerCase().trim())
    .filter(Boolean);
  return {
    ...rendered,
    plantillaId: plantilla._id.toString(),
    destinatarioKeys,
  };
}
