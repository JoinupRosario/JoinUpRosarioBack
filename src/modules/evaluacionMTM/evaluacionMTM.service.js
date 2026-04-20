import crypto from "crypto";
import mongoose from "mongoose";

import SurveyMTM from "./surveyMTM.model.js";
import EvaluacionMTM from "./evaluacionMTM.model.js";
import EvaluacionAccessToken from "./evaluacionAccessToken.model.js";
import RespuestaEvaluacionMTM from "./respuestaEvaluacionMTM.model.js";

import LegalizacionMTM from "../oportunidadesMTM/legalizacionMTM.model.js";
import PostulacionMTM from "../oportunidadesMTM/postulacionMTM.model.js";
import AsistenciaMTM from "../oportunidadesMTM/asistenciaMTM.model.js";
import OportunidadMTM from "../oportunidadesMTM/oportunidadMTM.model.js";
import UserAdministrativo from "../usersAdministrativos/userAdministrativo.model.js";
import User from "../users/user.model.js";
import Postulant from "../postulants/models/postulants.schema.js";
import PostulantProfile from "../postulants/models/profile/profile.schema.js";

import { dispatchNotificationByEvent } from "../notificacion/application/dispatchNotificationByEvent.service.js";
import { mtmFrontendLink } from "../notificacion/application/mtmNotifications.helper.js";

/**
 * Servicio interno del módulo de evaluación MTM.
 * Encapsula:
 *   - lookup de la SurveyMTM activa,
 *   - creación de la EvaluacionMTM por LegalizacionMTM (snapshot),
 *   - generación de tokens (monitor, profesor y por estudiante asistente),
 *   - despacho de correos con link único por actor.
 *
 * No expone Express handlers; lo consumen los controllers (auth y público) y
 * el endpoint `solicitarFinalizacionMTM` del módulo oportunidadesMTM.
 */

const EVENT_VALUE_BY_ACTOR = {
  monitor: "evaluacion_mtm_monitor",
  profesor: "evaluacion_mtm_profesor",
  estudiante: "evaluacion_mtm_estudiante",
};

/**
 * Override de testing: mientras se valida el flujo end-to-end, redirige TODOS
 * los correos de evaluación MTM (monitor/profesor/estudiantes) a esta dirección.
 * Para apagarlo: set `EVALUACION_MTM_OVERRIDE_EMAIL=` (vacío) en .env, o eliminar
 * esta constante y volver al destinatario real.
 */
const EVALUACION_MTM_OVERRIDE_EMAIL =
  process.env.EVALUACION_MTM_OVERRIDE_EMAIL ?? "diegoalexander1598@gmail.com";

function generarToken() {
  return crypto.randomBytes(24).toString("hex");
}

function buildLinkRespuesta(token) {
  return mtmFrontendLink(`/evaluacion-mtm/responder/${token}`);
}

export async function getSurveyActiva() {
  return SurveyMTM.findOne({ estado: "activa" }).lean();
}

/**
 * Snapshot de la SurveyMTM activa para clavar las preguntas a la evaluación.
 * @param {object} survey
 */
function buildSurveySnapshot(survey) {
  if (!survey) return {};
  return {
    nombre: survey.nombre,
    descripcion: survey.descripcion,
    monitor_form: survey.monitor_form || null,
    student_form: survey.student_form || null,
    teacher_form: survey.teacher_form || null,
  };
}

/**
 * Carga datos necesarios del flujo MTM para construir destinatarios y plantillas.
 */
async function loadContextoEvaluacion(legalizacion) {
  const postulacion = await PostulacionMTM.findById(legalizacion.postulacionMTM)
    .populate({
      path: "oportunidadMTM",
      select: "nombreCargo periodo profesorResponsable nombreProfesor",
      populate: [
        { path: "periodo", select: "codigo" },
        {
          path: "profesorResponsable",
          select: "nombres apellidos identificacion user",
          populate: { path: "user", select: "_id email name" },
        },
      ],
    })
    .populate({
      path: "postulant",
      populate: { path: "postulantId", select: "_id name email" },
    })
    .lean();
  return postulacion;
}

/**
 * Resuelve los estudiantes asistentes de una postulación.
 *
 * Estrategia (en orden, hasta encontrar email):
 *   1) `User.code` = identificacionEstudiante.
 *   2) `PostulantProfile.studentCode` = identificacionEstudiante,
 *      luego Postulant.postulantId → User.email.
 *      También se intenta usar `PostulantProfile.academicEmail` como fallback
 *      adicional cuando el User no tenga email registrado.
 *
 * Devuelve [{ identificacion, nombre, email|null, userId|null, fuente }].
 */
async function resolverAsistentes(postulacionId) {
  const asistencias = await AsistenciaMTM.find({ postulacionMTM: postulacionId })
    .select("identificacionEstudiante nombresEstudiante apellidosEstudiante")
    .lean();
  if (!asistencias.length) return [];

  const porIdentificacion = new Map();
  for (const a of asistencias) {
    const id = String(a.identificacionEstudiante || "").trim();
    if (!id) continue;
    if (!porIdentificacion.has(id)) {
      porIdentificacion.set(id, {
        identificacion: id,
        nombre: `${a.nombresEstudiante || ""} ${a.apellidosEstudiante || ""}`.trim(),
        email: null,
        userId: null,
        fuente: null,
      });
    }
  }
  if (!porIdentificacion.size) return [];

  const codes = [...porIdentificacion.keys()];

  // 1) Match directo por User.code
  const usersDirectos = await User.find({ code: { $in: codes } })
    .select("_id email code name estado")
    .lean();
  for (const u of usersDirectos) {
    const row = porIdentificacion.get(String(u.code));
    if (row && !row.email) {
      row.email = u.email || null;
      row.userId = u._id;
      row.nombre = row.nombre || u.name || "";
      if (row.email) row.fuente = "user.code";
    }
  }

  // 2) Fallback por PostulantProfile.studentCode → Postulant.postulantId → User
  const faltantes = [...porIdentificacion.values()].filter((r) => !r.email);
  if (faltantes.length) {
    const codigosFaltantes = faltantes.map((r) => r.identificacion);
    const profiles = await PostulantProfile.find({
      studentCode: { $in: codigosFaltantes },
    })
      .select("studentCode postulantId academicEmail academicUser")
      .lean();

    if (profiles.length) {
      const postulantIds = [
        ...new Set(profiles.map((p) => String(p.postulantId)).filter(Boolean)),
      ];
      const postulants = await Postulant.find({ _id: { $in: postulantIds } })
        .select("_id postulantId")
        .lean();
      const postulantById = new Map(postulants.map((p) => [String(p._id), p]));

      const userIds = [
        ...new Set(
          postulants.map((p) => String(p.postulantId)).filter(Boolean)
        ),
      ];
      const users = await User.find({ _id: { $in: userIds } })
        .select("_id email name")
        .lean();
      const userById = new Map(users.map((u) => [String(u._id), u]));

      for (const p of profiles) {
        const row = porIdentificacion.get(String(p.studentCode));
        if (!row || row.email) continue;
        const post = postulantById.get(String(p.postulantId));
        const user = post ? userById.get(String(post.postulantId)) : null;
        if (user?.email) {
          row.email = user.email;
          row.userId = user._id;
          row.nombre = row.nombre || user.name || "";
          row.fuente = "postulant_profile.studentCode";
        } else if (p.academicEmail) {
          row.email = p.academicEmail;
          row.userId = user?._id || null;
          row.nombre = row.nombre || user?.name || p.academicUser || "";
          row.fuente = "postulant_profile.academicEmail";
        }
      }
    }
  }

  return [...porIdentificacion.values()];
}

/**
 * Despacha el correo con el link único del actor.
 * Usa el sistema de notificaciones (busca Evento por value y la plantilla activa).
 * Si no hay plantilla, no rompe el flujo (solo loggea); el token queda creado.
 */
async function enviarCorreoActor({ actor, email, datos, nombreReal }) {
  if (!email) {
    console.log(
      `[evaluacionMTM][CORREO] actor=${actor} → SIN ENVIAR (destinatario real no tiene email)`
    );
    return null;
  }

  const overrideActivo = Boolean(EVALUACION_MTM_OVERRIDE_EMAIL);
  const emailDestino = overrideActivo ? EVALUACION_MTM_OVERRIDE_EMAIL : email;

  console.log(
    `[evaluacionMTM][CORREO] actor=${actor}` +
      `\n   ↳ Destinatario REAL (debería ir a):  ${nombreReal ? `${nombreReal} <${email}>` : email}` +
      `\n   ↳ Destinatario ACTUAL (envío real):  ${emailDestino}` +
      (overrideActivo
        ? "  ⚠ override de testing ACTIVO (EVALUACION_MTM_OVERRIDE_EMAIL)"
        : "")
  );

  const eventValue = EVENT_VALUE_BY_ACTOR[actor];
  try {
    const result = await dispatchNotificationByEvent({
      eventValue,
      tipo: "monitoria",
      datos,
      recipientContext: { destinatario: emailDestino },
      metadata: {
        actor,
        modulo: "evaluacion_mtm",
        emailReal: email,
        nombreReal: nombreReal || null,
        override: overrideActivo,
      },
    });

    if (result == null) {
      console.warn(
        `   ⚠ [evaluacionMTM][CORREO] actor=${actor} → dispatch devolvió null` +
          ` (no existe Evento "${eventValue}" tipo=monitoria, o no hay PlantillaNotificacion ACTIVA asociada).` +
          " Revisa el seeder `seedEventosEvaluacionMTM.js` o márcala como activa en la UI."
      );
    } else {
      console.log(
        `   ↳ [evaluacionMTM][CORREO] actor=${actor} dispatch result:` +
          ` queued=${result.queued ?? 0}` +
          ` · immediateSent=${result.immediateSent ?? 0}` +
          ` · skipped=${result.skipped ? "true" : "false"}` +
          ` · recipients=${(result.recipients || []).join(", ") || "(ninguno)"}`
      );
      if ((result.queued ?? 0) === 0 && (result.immediateSent ?? 0) === 0) {
        console.warn(
          `   ⚠ [evaluacionMTM][CORREO] actor=${actor} → no se encoló ni envió nada (probable falta de destinatarios o SENDGRID_API_KEY).`
        );
      }
    }
    return result;
  } catch (err) {
    console.error(
      `[evaluacionMTM] Error enviando correo a ${actor} (real=${email}, enviado=${emailDestino}):`,
      err?.message || err
    );
    return null;
  }
}

/**
 * Crea (o reutiliza) un access token para el actor indicado y le dispara el correo.
 */
async function crearTokenYNotificar({
  evaluacion,
  actor,
  identificadorActor,
  nombreActor,
  email,
  datosBase,
}) {
  let token = await EvaluacionAccessToken.findOne({
    evaluacionMTM: evaluacion._id,
    actor,
    identificadorActor: String(identificadorActor),
  });

  if (!token) {
    token = await EvaluacionAccessToken.create({
      evaluacionMTM: evaluacion._id,
      actor,
      identificadorActor: String(identificadorActor),
      nombreActor: nombreActor || "",
      email: email || "",
      token: generarToken(),
    });
  } else {
    token.email = email || token.email;
    token.nombreActor = nombreActor || token.nombreActor;
    await token.save();
  }

  const link = buildLinkRespuesta(token.token);
  const datos = {
    ...datosBase,
    NOMBRE_DESTINATARIO: nombreActor || "",
    LINK_EVALUACION: link,
    LINK: link,
    ACTOR: actor,
  };

  await enviarCorreoActor({ actor, email, datos, nombreReal: nombreActor });
  return token;
}

/**
 * Hub principal: dispara la evaluación para una legalización dada.
 * Idempotente: si ya existe la EvaluacionMTM no la re-crea, pero re-genera tokens faltantes.
 *
 * @param {object} params
 * @param {object} params.legalizacion  Documento Mongoose (o lean) de LegalizacionMTM
 * @param {mongoose.Types.ObjectId|string|null} [params.disparadaPor]
 * @returns {Promise<{evaluacion: object, tokens: { monitor: object|null, profesor: object|null, estudiantes: number }, warnings: string[]}>}
 */
export async function dispararEvaluacionParaLegalizacion({ legalizacion, disparadaPor = null }) {
  if (!legalizacion?._id) throw new Error("Legalización inválida");

  const warnings = [];

  const survey = await getSurveyActiva();
  if (!survey) {
    throw new Error(
      "No hay una SurveyMTM activa configurada. El coordinador general debe activar una plantilla antes de disparar evaluaciones."
    );
  }

  const postulacion = await loadContextoEvaluacion(legalizacion);
  if (!postulacion?.oportunidadMTM) {
    throw new Error("La postulación asociada a la legalización no tiene oportunidad cargada");
  }

  let evaluacion = await EvaluacionMTM.findOne({ legalizacionMTM: legalizacion._id });
  if (!evaluacion) {
    evaluacion = await EvaluacionMTM.create({
      legalizacionMTM: legalizacion._id,
      postulacionMTM: postulacion._id,
      oportunidadMTM: postulacion.oportunidadMTM._id,
      survey: survey._id,
      surveySnapshot: buildSurveySnapshot(survey),
      estado: "creada",
      disparadaPor: disparadaPor || null,
    });
  }

  const oportunidad = postulacion.oportunidadMTM;
  const datosBase = {
    NOMBRE_MONITORIA: oportunidad?.nombreCargo || "",
    NOMBRE_OPORTUNIDAD: oportunidad?.nombreCargo || "",
    PERIODO: oportunidad?.periodo?.codigo || "",
  };

  console.log(
    `\n[evaluacionMTM][DISPARO] legalización=${legalizacion._id} · oportunidad="${oportunidad?.nombreCargo || ""}"`
  );

  // ── Monitor ────────────────────────────────────────────────────────────────
  const monitorUserId = postulacion.postulant?.postulantId?._id;
  const monitorEmail = postulacion.postulant?.postulantId?.email;
  const monitorNombre = postulacion.postulant?.postulantId?.name;
  console.log(
    `   • Monitor → userId=${monitorUserId || "(null)"} · nombre="${monitorNombre || ""}" · email="${monitorEmail || ""}"`
  );
  let tokenMonitor = null;
  if (monitorUserId && monitorEmail) {
    tokenMonitor = await crearTokenYNotificar({
      evaluacion,
      actor: "monitor",
      identificadorActor: monitorUserId,
      nombreActor: monitorNombre,
      email: monitorEmail,
      datosBase,
    });
  } else {
    const w = "Monitor sin email/usuario asociado; no se generó token de autoevaluación.";
    warnings.push(w);
    console.warn(`   ⚠ ${w}`);
  }

  // ── Profesor responsable ───────────────────────────────────────────────────
  let profesor = oportunidad?.profesorResponsable;
  let profesorUserId = profesor?.user?._id;
  let profesorEmail = profesor?.user?.email;
  let profesorNombre = `${profesor?.nombres || ""} ${profesor?.apellidos || ""}`.trim();

  // Diagnóstico/recuperación: si no vino populado, leer el documento crudo de
  // la oportunidad para entender si el campo está realmente vacío en BD o si
  // fue el populate. Si solo hay `nombreProfesor` (texto), intenta buscar el
  // UserAdministrativo por nombre.
  if (!profesor) {
    const oppRaw = await OportunidadMTM.findById(oportunidad._id)
      .select("profesorResponsable nombreProfesor")
      .lean();
    console.log(
      `   • Profesor → DIAGNÓSTICO oportunidad cruda:` +
        ` profesorResponsable=${oppRaw?.profesorResponsable || "(vacío en BD)"}` +
        ` · nombreProfesor="${oppRaw?.nombreProfesor || ""}"`
    );

    let adminDoc = null;
    if (oppRaw?.profesorResponsable) {
      adminDoc = await UserAdministrativo.findById(oppRaw.profesorResponsable)
        .select("nombres apellidos user")
        .populate({ path: "user", select: "_id email name" })
        .lean();
      if (!adminDoc) {
        console.warn(
          `   ⚠ La oportunidad referencia UserAdministrativo id=${oppRaw.profesorResponsable} pero no existe en BD.`
        );
      }
    }

    // Fallback: buscar por nombre completo cuando solo existe `nombreProfesor`.
    if (!adminDoc && oppRaw?.nombreProfesor) {
      const partes = String(oppRaw.nombreProfesor).trim().split(/\s+/);
      if (partes.length >= 2) {
        const mitad = Math.ceil(partes.length / 2);
        const nombresGuess = partes.slice(0, mitad).join(" ");
        const apellidosGuess = partes.slice(mitad).join(" ");
        const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const candidatos = await UserAdministrativo.find({
          $or: [
            {
              nombres: new RegExp(`^${escapeRx(nombresGuess)}$`, "i"),
              apellidos: new RegExp(`^${escapeRx(apellidosGuess)}$`, "i"),
            },
            // por si el orden del nombre completo está como "Nombres Apellidos" pero la división no calza
            {
              $expr: {
                $eq: [
                  {
                    $toLower: {
                      $trim: {
                        input: { $concat: ["$nombres", " ", "$apellidos"] },
                      },
                    },
                  },
                  String(oppRaw.nombreProfesor).trim().toLowerCase(),
                ],
              },
            },
          ],
        })
          .select("nombres apellidos user")
          .populate({ path: "user", select: "_id email name" })
          .lean();
        if (candidatos.length === 1) {
          adminDoc = candidatos[0];
          console.log(
            `   • Profesor → recuperado por nombre ("${oppRaw.nombreProfesor}"): ${adminDoc.nombres} ${adminDoc.apellidos} (id=${adminDoc._id})`
          );
        } else if (candidatos.length > 1) {
          console.warn(
            `   ⚠ "${oppRaw.nombreProfesor}" coincide con ${candidatos.length} usuarios administrativos; no se puede resolver automáticamente.`
          );
        } else {
          console.warn(
            `   ⚠ "${oppRaw.nombreProfesor}" no coincide con ningún UserAdministrativo en BD.`
          );
        }
      }
    }

    if (adminDoc) {
      console.log(
        `   • Profesor → admin resuelto: ${adminDoc.nombres} ${adminDoc.apellidos}` +
          ` · userId=${adminDoc.user?._id || "(null)"} · email="${adminDoc.user?.email || ""}"`
      );
      profesor = adminDoc;
      profesorUserId = adminDoc.user?._id;
      profesorEmail = adminDoc.user?.email;
      profesorNombre = `${adminDoc.nombres || ""} ${adminDoc.apellidos || ""}`.trim();
    }
  }

  console.log(
    `   • Profesor → adminId=${profesor?._id || "(no asignado en oportunidad)"}` +
      ` · nombre="${profesorNombre}"` +
      ` · userId=${profesorUserId || "(null)"}` +
      ` · email="${profesorEmail || ""}"`
  );
  if (!profesor) {
    const w = "La oportunidad no tiene profesor/coordinador responsable asignado.";
    warnings.push(w);
    console.warn(`   ⚠ ${w}`);
  } else if (!profesor.user) {
    const w = `UserAdministrativo "${profesorNombre}" (id=${profesor._id}) no tiene un usuario (user) vinculado en BD.`;
    warnings.push(w);
    console.warn(`   ⚠ ${w}`);
  } else if (!profesorEmail) {
    const w = `El usuario asociado al profesor "${profesorNombre}" no tiene email registrado.`;
    warnings.push(w);
    console.warn(`   ⚠ ${w}`);
  }
  let tokenProfesor = null;
  if (profesorUserId && profesorEmail) {
    tokenProfesor = await crearTokenYNotificar({
      evaluacion,
      actor: "profesor",
      identificadorActor: profesorUserId,
      nombreActor: profesorNombre,
      email: profesorEmail,
      datosBase,
    });
  }

  // ── Estudiantes asistentes ─────────────────────────────────────────────────
  const asistentes = await resolverAsistentes(postulacion._id);
  console.log(`   • Estudiantes asistentes únicos detectados: ${asistentes.length}`);
  let estudiantesGenerados = 0;
  let estudiantesSinCorreo = 0;
  for (const a of asistentes) {
    if (!a.email) {
      estudiantesSinCorreo += 1;
      console.warn(
        `      ⚠ Asistente sin correo (no resuelto en User.code ni PostulantProfile.studentCode=${a.identificacion}) — "${a.nombre}"`
      );
      continue;
    }
    console.log(
      `      ↳ Asistente "${a.nombre}" · code=${a.identificacion} · email=${a.email} · fuente=${a.fuente}`
    );
    await crearTokenYNotificar({
      evaluacion,
      actor: "estudiante",
      identificadorActor: a.identificacion,
      nombreActor: a.nombre,
      email: a.email,
      datosBase,
    });
    estudiantesGenerados += 1;
  }
  if (estudiantesSinCorreo > 0) {
    warnings.push(
      `${estudiantesSinCorreo} asistente(s) sin correo en User.code ni en PostulantProfile.studentCode; no se enviará evaluación a esos estudiantes.`
    );
  }
  if (asistentes.length === 0) {
    const w = "No hay asistencias registradas para esta MTM; no se generaron tokens de estudiantes.";
    warnings.push(w);
    console.warn(`   ⚠ ${w}`);
  }

  if (warnings.length) {
    console.warn(
      `[evaluacionMTM][DISPARO] Resumen warnings (${warnings.length}):\n   - ${warnings.join("\n   - ")}`
    );
  }
  console.log(
    `[evaluacionMTM][DISPARO] Tokens generados → monitor=${tokenMonitor ? "✓" : "✗"} · profesor=${tokenProfesor ? "✓" : "✗"} · estudiantes=${estudiantesGenerados}\n`
  );

  evaluacion.totalEstudiantesEsperados = estudiantesGenerados;
  evaluacion.estado = "enviada";
  if (!evaluacion.enviadaAt) evaluacion.enviadaAt = new Date();
  await evaluacion.save();

  return {
    evaluacion,
    tokens: {
      monitor: tokenMonitor,
      profesor: tokenProfesor,
      estudiantes: estudiantesGenerados,
    },
    warnings,
  };
}

/**
 * Indica si el monitor ya completó la autoevaluación de la legalización.
 * Se usa como prerrequisito en `finalizarMTM` (paso 17 del flujo GuiARTE).
 */
export async function monitorYaAutoEvaluo(legalizacionId) {
  const evaluacion = await EvaluacionMTM.findOne({ legalizacionMTM: legalizacionId })
    .select("monitorRespondidoAt")
    .lean();
  return Boolean(evaluacion?.monitorRespondidoAt);
}

/**
 * Calcula el promedio ponderado a partir de respuestas numéricas (escala/numero).
 * Devuelve null si no hay respuestas numéricas.
 */
function calcularPuntajePonderado(items) {
  if (!Array.isArray(items) || !items.length) return null;
  let sumaPesos = 0;
  let sumaPonderada = 0;
  for (const it of items) {
    const valorNumerico =
      typeof it.valor === "number"
        ? it.valor
        : Number.isFinite(Number(it.valor))
        ? Number(it.valor)
        : null;
    if (valorNumerico == null) continue;
    const peso = typeof it.peso === "number" ? it.peso : 1;
    sumaPesos += peso;
    sumaPonderada += peso * valorNumerico;
  }
  if (sumaPesos === 0) return null;
  return Number((sumaPonderada / sumaPesos).toFixed(2));
}

/**
 * Resuelve el snapshot del formulario que le corresponde al actor del token.
 */
export function getFormularioParaActor(evaluacion, actor) {
  const snap = evaluacion?.surveySnapshot || {};
  if (actor === "monitor") return snap.monitor_form || { preguntas: [] };
  if (actor === "estudiante") return snap.student_form || { preguntas: [] };
  if (actor === "profesor") return snap.teacher_form || { preguntas: [] };
  return { preguntas: [] };
}

/**
 * Persiste la respuesta de un actor.
 * - Marca el token como usado.
 * - Actualiza contadores de la EvaluacionMTM.
 * - Cuando el actor es 'monitor' setea monitorRespondidoAt (clave para finalizarMTM).
 */
export async function registrarRespuestaActor({
  token,
  evaluacion,
  respuestasInput,
  ip,
  userAgent,
}) {
  if (token.usado) {
    const e = new Error("Esta evaluación ya fue respondida.");
    e.code = "TOKEN_USADO";
    throw e;
  }

  const formulario = getFormularioParaActor(evaluacion, token.actor);
  const preguntasById = new Map(
    (formulario.preguntas || []).map((p) => [String(p._id), p])
  );

  const items = [];
  for (const r of Array.isArray(respuestasInput) ? respuestasInput : []) {
    const preguntaId = r?.preguntaId;
    if (!preguntaId) continue;
    const pregunta = preguntasById.get(String(preguntaId));
    if (!pregunta) continue;
    items.push({
      preguntaId: pregunta._id,
      preguntaTexto: pregunta.texto,
      tipo: pregunta.tipo,
      valor: r.valor ?? null,
      peso: typeof pregunta.peso === "number" ? pregunta.peso : 1,
    });
  }

  for (const p of formulario.preguntas || []) {
    if (!p.requerida) continue;
    const item = items.find((i) => String(i.preguntaId) === String(p._id));
    const valor = item?.valor;
    const vacio =
      valor == null ||
      (typeof valor === "string" && valor.trim() === "") ||
      (Array.isArray(valor) && valor.length === 0);
    if (vacio) {
      const e = new Error(`La pregunta "${p.texto}" es requerida.`);
      e.code = "PREGUNTA_REQUERIDA";
      throw e;
    }
  }

  const puntaje = calcularPuntajePonderado(items);

  const respuesta = await RespuestaEvaluacionMTM.create({
    evaluacionMTM: evaluacion._id,
    accessToken: token._id,
    actor: token.actor,
    identificadorActor: token.identificadorActor,
    nombreActor: token.nombreActor,
    email: token.email,
    respuestas: items,
    puntajePonderado: puntaje,
    ip: ip || null,
    userAgent: userAgent || null,
  });

  token.usado = true;
  token.fechaUso = new Date();
  await token.save();

  if (token.actor === "monitor") {
    evaluacion.monitorRespondidoAt = new Date();
  } else if (token.actor === "profesor") {
    evaluacion.profesorRespondidoAt = new Date();
  } else if (token.actor === "estudiante") {
    evaluacion.totalEstudiantesRespondidos =
      (evaluacion.totalEstudiantesRespondidos || 0) + 1;
  }

  const totalRespuestas = await RespuestaEvaluacionMTM.countDocuments({
    evaluacionMTM: evaluacion._id,
  });
  const totalEsperado =
    (evaluacion.monitorRespondidoAt ? 1 : 0) +
    (evaluacion.profesorRespondidoAt ? 1 : 0) +
    (evaluacion.totalEstudiantesEsperados || 0);
  if (totalEsperado > 0 && totalRespuestas >= totalEsperado) {
    evaluacion.estado = "completa";
  } else if (totalRespuestas > 0) {
    evaluacion.estado = "parcial";
  }
  await evaluacion.save();

  return { respuesta, evaluacion };
}

/**
 * Vuelve a enviar el correo del actor (desde panel de coordinación).
 */
export async function reenviarCorreoToken(tokenId) {
  const token = await EvaluacionAccessToken.findById(tokenId);
  if (!token) {
    const e = new Error("Token no encontrado");
    e.code = "NOT_FOUND";
    throw e;
  }
  if (token.usado) {
    const e = new Error("La evaluación ya fue respondida; no se puede reenviar el enlace.");
    e.code = "TOKEN_USADO";
    throw e;
  }
  if (!token.email) {
    const e = new Error("El destinatario no tiene correo registrado.");
    e.code = "SIN_EMAIL";
    throw e;
  }

  const evaluacion = await EvaluacionMTM.findById(token.evaluacionMTM)
    .populate({ path: "oportunidadMTM", select: "nombreCargo periodo", populate: { path: "periodo", select: "codigo" } })
    .lean();

  const datosBase = {
    NOMBRE_MONITORIA: evaluacion?.oportunidadMTM?.nombreCargo || "",
    NOMBRE_OPORTUNIDAD: evaluacion?.oportunidadMTM?.nombreCargo || "",
    PERIODO: evaluacion?.oportunidadMTM?.periodo?.codigo || "",
  };
  const link = buildLinkRespuesta(token.token);
  const datos = {
    ...datosBase,
    NOMBRE_DESTINATARIO: token.nombreActor || "",
    LINK_EVALUACION: link,
    LINK: link,
    ACTOR: token.actor,
  };

  await enviarCorreoActor({
    actor: token.actor,
    email: token.email,
    datos,
    nombreReal: token.nombreActor,
  });

  token.reenvios = (token.reenvios || 0) + 1;
  token.ultimoReenvioAt = new Date();
  await token.save();

  return token;
}

export const __test__ = { calcularPuntajePonderado, buildSurveySnapshot, buildLinkRespuesta };
