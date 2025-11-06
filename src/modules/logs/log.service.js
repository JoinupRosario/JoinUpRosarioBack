import Log from './log.model.js';

/**
 * Crea un log en el sistema
 * @param {Object} options - Opciones para el log
 * @param {Object} options.usuarioId - ID del usuario que realiza la acción
 * @param {String} options.accion - Acción realizada (CREATE, UPDATE, DELETE, etc.)
 * @param {String} options.modulo - Módulo donde se realizó la acción (companies, users, etc.)
 * @param {String} options.descripcion - Descripción de la acción
 * @param {Object} options.entidadId - ID de la entidad afectada (opcional)
 * @param {Object} options.datosAntes - Datos antes de la acción (opcional, para updates)
 * @param {Object} options.datosDespues - Datos después de la acción (opcional, para updates)
 * @param {String} options.ip - IP del usuario (opcional)
 * @param {String} options.userAgent - User agent del usuario (opcional)
 * @param {Object} options.metadata - Metadatos adicionales (opcional)
 * @returns {Promise<Object>} - Log creado
 */
export const crearLog = async ({
  usuarioId,
  accion,
  modulo,
  descripcion,
  entidadId = null,
  datosAntes = null,
  datosDespues = null,
  ip = null,
  userAgent = null,
  metadata = {}
}) => {
  try {
    const log = new Log({
      usuario: usuarioId,
      accion: accion.toUpperCase(),
      modulo,
      descripcion,
      entidadId,
      datosAntes,
      datosDespues,
      ip,
      userAgent,
      metadata
    });

    await log.save();
    return log;
  } catch (error) {
    // No lanzar error para que no afecte la operación principal
    console.error('Error al crear log:', error);
    return null;
  }
};

/**
 * Helper para obtener IP y User Agent del request
 */
export const obtenerInfoRequest = (req) => {
  const ip = req.ip || 
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress ||
             (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             'unknown';
  
  const userAgent = req.get('user-agent') || 'unknown';
  
  return { ip, userAgent };
};

/**
 * Helper para crear logs desde un controlador
 */
export const logHelper = {
  crear: (req, accion, modulo, descripcion, entidadId = null, datosAntes = null, datosDespues = null, metadata = {}) => {
    const usuarioId = req.user?.id || null;
    if (!usuarioId) {
      console.warn('Intento de crear log sin usuario autenticado');
      return Promise.resolve(null);
    }

    const { ip, userAgent } = obtenerInfoRequest(req);
    
    return crearLog({
      usuarioId,
      accion,
      modulo,
      descripcion,
      entidadId,
      datosAntes,
      datosDespues,
      ip,
      userAgent,
      metadata
    });
  },

  crearDesdeUsuarioId: (usuarioId, accion, modulo, descripcion, entidadId = null, datosAntes = null, datosDespues = null, metadata = {}) => {
    return crearLog({
      usuarioId,
      accion,
      modulo,
      descripcion,
      entidadId,
      datosAntes,
      datosDespues,
      ip: null,
      userAgent: null,
      metadata
    });
  }
};

