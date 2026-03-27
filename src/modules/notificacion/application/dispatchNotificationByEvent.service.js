import Evento from "../eventos/evento.model.js";
import { getRenderedActivePlantilla } from "../plantillasNotificacion/plantillaNotificacion.service.js";
import { dispatchRenderedNotification } from "./notificationDispatch.service.js";

/**
 * Ejecuta una notificación a partir de un evento de catálogo.
 * Centraliza: búsqueda de evento -> plantilla activa -> render -> dispatch.
 *
 * @param {object} params
 * @param {string} params.eventValue - value del evento (ej. creacion_oportunidad_monitoria)
 * @param {string} [params.tipo=monitoria] - tipo del evento
 * @param {Record<string, string|number|null|undefined>} [params.datos={}] - variables de plantilla
 * @param {Record<string, string|string[]|undefined>} [params.recipientContext={}] - contexto de correos por destinatario
 * @param {Record<string, unknown>} [params.metadata={}] - metadata para trazabilidad
 * @returns {Promise<{queued:number,immediateSent?:number,recipients:string[]}|null>}
 */
export async function dispatchNotificationByEvent({
  eventValue,
  tipo = "monitoria",
  datos = {},
  recipientContext = {},
  metadata = {},
}) {
  if (!eventValue) return null;

  const evento = await Evento.findOne({ value: eventValue, tipo }).select("_id").lean();
  if (!evento) return null;

  const rendered = await getRenderedActivePlantilla(evento._id, datos);
  if (!rendered) return null;

  return dispatchRenderedNotification({
    rendered,
    recipientContext,
    metadata: { evento: eventValue, tipo, ...metadata },
  });
}
