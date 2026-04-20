/**
 * Reencola jobs `failed` a `pending` para que el worker los reintente.
 * Pone attempts=0 y limpia lastError.
 *
 * Uso:
 *   node src/scripts/reintentarEmailJobsFallidos.js                # todos los failed
 *   node src/scripts/reintentarEmailJobsFallidos.js evaluacion_mtm # solo del módulo
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import EmailNotificationJob from "../modules/notificacion/infrastructure/emailNotificationJob.model.js";

const filtroModulo = process.argv[2];

async function run() {
  await connectDB();

  const filter = filtroModulo
    ? { status: "failed", "metadata.modulo": filtroModulo }
    : { status: "failed" };

  const previa = await EmailNotificationJob.find(filter)
    .select("to subject metadata.actor metadata.evento attempts lastError")
    .lean();

  console.log(`\nJobs failed encontrados: ${previa.length}`);
  previa.forEach((j) =>
    console.log(
      `  · to=${j.to} · subject="${j.subject}"` +
        (j.metadata?.actor ? ` · actor=${j.metadata.actor}` : "") +
        (j.lastError ? `\n      ⚠ ${j.lastError}` : "")
    )
  );

  if (previa.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const r = await EmailNotificationJob.updateMany(filter, {
    $set: {
      status: "pending",
      attempts: 0,
      lastError: null,
      processingStartedAt: null,
    },
  });
  console.log(`\n→ Reencolados a pending: ${r.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
