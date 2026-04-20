/**
 * Diagnóstico rápido: muestra el estado de Evento + PlantillaNotificacion
 * para los 3 actores de la evaluación MTM.
 *
 * Uso:
 *   node src/scripts/checkEventosEvaluacionMTM.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Evento from "../modules/notificacion/eventos/evento.model.js";
import PlantillaNotificacion from "../modules/notificacion/plantillasNotificacion/plantillaNotificacion.model.js";

const VALORES = [
  "evaluacion_mtm_monitor",
  "evaluacion_mtm_profesor",
  "evaluacion_mtm_estudiante",
];

async function run() {
  await connectDB();

  for (const value of VALORES) {
    const evento = await Evento.findOne({ value, tipo: "monitoria" }).lean();
    console.log(`\n──── ${value} ────`);
    if (!evento) {
      console.log("  ✗ NO existe Evento con este value/tipo");
      continue;
    }
    console.log(`  ✓ Evento _id=${evento._id} · nombre="${evento.nombre}"`);

    const plantillas = await PlantillaNotificacion.find({
      parametroPlantillaId: evento._id,
    })
      .select("asunto isActive frecuencia destinatarios createdAt updatedAt")
      .lean();

    if (!plantillas.length) {
      console.log("  ✗ NO hay plantillas asociadas");
      continue;
    }
    plantillas.forEach((p) => {
      console.log(
        `  · plantilla _id=${p._id} · isActive=${p.isActive} · destinatarios=${JSON.stringify(
          p.destinatarios || []
        )} · asunto="${p.asunto}"`
      );
    });
    const activa = plantillas.find((p) => p.isActive);
    console.log(`  → Activa: ${activa ? "SÍ (" + activa._id + ")" : "NO ⚠"}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
