import EvaluacionMTM from "./evaluacionMTM.model.js";
import EvaluacionAccessToken from "./evaluacionAccessToken.model.js";

import {
  getFormularioParaActor,
  registrarRespuestaActor,
} from "./evaluacionMTM.service.js";

/**
 * Endpoints públicos (sin auth) consumidos por la página de respuesta.
 * Se identifica al actor mediante el `token` enviado por correo.
 */

async function loadTokenYEvaluacion(tokenStr) {
  if (!tokenStr) return { error: 400, message: "Token requerido" };
  const token = await EvaluacionAccessToken.findOne({ token: String(tokenStr) });
  if (!token) return { error: 404, message: "Enlace inválido" };
  if (token.usado) return { error: 410, message: "Esta evaluación ya fue respondida" };
  if (token.expiraEn && token.expiraEn < new Date()) {
    return { error: 410, message: "El enlace de evaluación ha expirado" };
  }
  const evaluacion = await EvaluacionMTM.findById(token.evaluacionMTM)
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo",
      populate: { path: "periodo", select: "codigo" },
    })
    .lean();
  if (!evaluacion) return { error: 404, message: "Evaluación no encontrada" };
  return { token, evaluacion };
}

export const getFormularioPublico = async (req, res) => {
  try {
    const { token: tokenStr } = req.params;
    const ctx = await loadTokenYEvaluacion(tokenStr);
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    const formulario = getFormularioParaActor(ctx.evaluacion, ctx.token.actor);
    res.json({
      actor: ctx.token.actor,
      destinatario: {
        nombre: ctx.token.nombreActor,
        email: ctx.token.email,
      },
      contexto: {
        nombreMonitoria: ctx.evaluacion.oportunidadMTM?.nombreCargo || "",
        periodo: ctx.evaluacion.oportunidadMTM?.periodo?.codigo || "",
      },
      formulario,
    });
  } catch (err) {
    console.error("[evaluacionMTM:public] getFormularioPublico:", err);
    res.status(500).json({ message: err.message });
  }
};

export const postRespuestaPublica = async (req, res) => {
  try {
    const { token: tokenStr } = req.params;
    const ctx = await loadTokenYEvaluacion(tokenStr);
    if (ctx.error) return res.status(ctx.error).json({ message: ctx.message });

    // Recargamos el documento mutable (no el lean) para poder guardarlo dentro del servicio.
    const evaluacionMutable = await EvaluacionMTM.findById(ctx.evaluacion._id);

    const { respuestas } = req.body || {};
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip;
    const userAgent = req.headers["user-agent"] || "";

    const result = await registrarRespuestaActor({
      token: ctx.token,
      evaluacion: evaluacionMutable,
      respuestasInput: respuestas,
      ip,
      userAgent,
    });

    res.json({
      message: "Evaluación registrada correctamente. ¡Gracias por tu respuesta!",
      respuestaId: result.respuesta._id,
      puntajePonderado: result.respuesta.puntajePonderado,
    });
  } catch (err) {
    if (err.code === "TOKEN_USADO") return res.status(409).json({ message: err.message });
    if (err.code === "PREGUNTA_REQUERIDA") return res.status(400).json({ message: err.message });
    console.error("[evaluacionMTM:public] postRespuestaPublica:", err);
    res.status(500).json({ message: err.message });
  }
};
