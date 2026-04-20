/**
 * Seed de eventos + plantillas activas básicas para Evaluación MTM (RQ04_HU011).
 *
 * IDEMPOTENTE Y NO DESTRUCTIVO:
 *   - Si el evento/plantilla YA existe en BD, NO se modifica (ni nombre, ni variables,
 *     ni asunto, ni cuerpo, ni isActive). Se respetan ediciones hechas desde la UI.
 *   - Si no existe, se crea con valores por defecto razonables.
 *   - Los _id de Mongo de documentos existentes nunca cambian.
 *
 * Eventos creados (tipo: monitoria):
 *   - evaluacion_mtm_monitor      → autoevaluación del monitor
 *   - evaluacion_mtm_profesor     → evaluación del profesor responsable
 *   - evaluacion_mtm_estudiante   → evaluación del estudiante asistente
 *
 * Uso:
 *   node src/modules/evaluacionMTM/seedEventosEvaluacionMTM.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../../config/db.js";
import Evento from "../notificacion/eventos/evento.model.js";
import PlantillaNotificacion from "../notificacion/plantillasNotificacion/plantillaNotificacion.model.js";

const VARIABLES = [
  { variable: "NOMBRE_DESTINATARIO", desc: "Nombre del destinatario del correo" },
  { variable: "NOMBRE_MONITORIA", desc: "Nombre del cargo/MTM evaluada" },
  { variable: "NOMBRE_OPORTUNIDAD", desc: "Alias de NOMBRE_MONITORIA" },
  { variable: "PERIODO", desc: "Código del período académico" },
  { variable: "LINK_EVALUACION", desc: "URL pública para responder la evaluación" },
  { variable: "LINK", desc: "Alias de LINK_EVALUACION" },
  { variable: "ACTOR", desc: "Rol del destinatario (monitor|profesor|estudiante)" },
];

function plantillaHtml({ titulo, intro, cta }) {
  return `<p>Hola <strong>[NOMBRE_DESTINATARIO]</strong>,</p>
<p>${intro}</p>
<p><strong>MTM:</strong> [NOMBRE_MONITORIA]<br/>
<strong>Periodo:</strong> [PERIODO]</p>
<p style="margin:24px 0;">
  <a href="[LINK_EVALUACION]"
     style="display:inline-block;padding:10px 18px;background:#1a4a8a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
    ${cta}
  </a>
</p>
<p style="font-size:12px;color:#666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
[LINK_EVALUACION]</p>
<p style="font-size:12px;color:#999;">— ${titulo}</p>`;
}

const EVENTOS = [
  {
    value: "evaluacion_mtm_monitor",
    nombre: "Evaluación MTM — Autoevaluación del monitor",
    plantilla: {
      asunto: "Autoevaluación de tu MTM [NOMBRE_MONITORIA]",
      cuerpo: plantillaHtml({
        titulo: "Programa GuiARTE — MTM",
        intro:
          "Has solicitado la finalización de tu MTM. Para completar el cierre necesitas diligenciar tu autoevaluación.",
        cta: "Responder autoevaluación",
      }),
    },
  },
  {
    value: "evaluacion_mtm_profesor",
    nombre: "Evaluación MTM — Profesor responsable",
    plantilla: {
      asunto: "Evaluación del MTM [NOMBRE_MONITORIA]",
      cuerpo: plantillaHtml({
        titulo: "Programa GuiARTE — MTM",
        intro:
          "El estudiante a tu cargo solicitó la finalización de su MTM. Te invitamos a evaluar su desempeño.",
        cta: "Evaluar al MTM",
      }),
    },
  },
  {
    value: "evaluacion_mtm_estudiante",
    nombre: "Evaluación MTM — Estudiante asistente",
    plantilla: {
      asunto: "Cuéntanos: ¿cómo te fue con [NOMBRE_MONITORIA]?",
      cuerpo: plantillaHtml({
        titulo: "Programa GuiARTE — MTM",
        intro:
          "Asististe a un espacio del programa GuiARTE. Tu evaluación nos ayuda a mejorar y reconocer la labor del MTM.",
        cta: "Responder evaluación",
      }),
    },
  },
];

/**
 * Devuelve el evento existente o lo crea con los defaults indicados.
 * Si ya existía no se altera (ni siquiera nombre/variables): respeta lo que haya en BD.
 */
async function getOrCreateEvento({ value, nombre }) {
  const existente = await Evento.findOne({ value, tipo: "monitoria" });
  if (existente) {
    return { evento: existente, created: false };
  }
  const created = await Evento.create({
    value,
    tipo: "monitoria",
    nombre,
    variables: VARIABLES,
  });
  return { evento: created, created: true };
}

/**
 * Si el evento NO tiene plantilla, crea una activa con el contenido por defecto.
 * Si YA tiene plantilla(s), no toca nada (ni isActive, ni asunto, ni cuerpo).
 */
async function getOrCreatePlantilla(eventoId, plantilla) {
  const existente = await PlantillaNotificacion.findOne({
    parametroPlantillaId: eventoId,
  }).lean();
  if (existente) {
    return { plantillaId: existente._id, created: false };
  }
  const created = await PlantillaNotificacion.create({
    parametroPlantillaId: eventoId,
    asunto: plantilla.asunto,
    cuerpo: plantilla.cuerpo,
    frecuencia: "inmediato",
    destinatarios: [],
    isActive: true,
  });
  return { plantillaId: created._id, created: true };
}

async function run() {
  try {
    await connectDB();

    let eventosCreados = 0;
    let eventosExistentes = 0;
    let plantillasCreadas = 0;
    let plantillasExistentes = 0;

    for (const e of EVENTOS) {
      const { evento, created: eventoCreado } = await getOrCreateEvento({
        value: e.value,
        nombre: e.nombre,
      });
      if (eventoCreado) eventosCreados += 1;
      else eventosExistentes += 1;

      const { plantillaId, created: plantillaCreada } = await getOrCreatePlantilla(
        evento._id,
        e.plantilla
      );
      if (plantillaCreada) plantillasCreadas += 1;
      else plantillasExistentes += 1;

      console.log(
        `${eventoCreado ? "🆕" : "✅"} ${e.value} → evento ${evento._id} ` +
          `${eventoCreado ? "(creado)" : "(ya existía, no se modificó)"} | ` +
          `plantilla ${plantillaId} ${plantillaCreada ? "(creada)" : "(ya existía, no se modificó)"}`
      );
    }

    console.log("\n📊 Resumen:");
    console.log(`   Eventos creados:     ${eventosCreados}`);
    console.log(`   Eventos preservados: ${eventosExistentes}`);
    console.log(`   Plantillas creadas:     ${plantillasCreadas}`);
    console.log(`   Plantillas preservadas: ${plantillasExistentes}`);

    await mongoose.disconnect();
    console.log("\n🎉 Seed evaluación MTM completado sin alterar registros existentes.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed evaluación MTM falló:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

run();
