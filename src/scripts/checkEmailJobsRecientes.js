/**
 * Lista los últimos 30 EmailNotificationJob (status, intentos, error).
 *
 * Uso:
 *   node src/scripts/checkEmailJobsRecientes.js
 *   node src/scripts/checkEmailJobsRecientes.js evaluacion_mtm
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
    ? { "metadata.modulo": filtroModulo }
    : {};
  const jobs = await EmailNotificationJob.find(filter)
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  console.log(`\nÚltimos ${jobs.length} jobs${filtroModulo ? ` (modulo=${filtroModulo})` : ""}:\n`);
  jobs.forEach((j) => {
    console.log(
      `${j.createdAt?.toISOString?.() || j.createdAt} · ${j.status.padEnd(10)} · ` +
        `attempts=${j.attempts || 0} · to=${j.to} · subject="${j.subject}"` +
        (j.metadata?.actor ? ` · actor=${j.metadata.actor}` : "") +
        (j.metadata?.evento ? ` · evento=${j.metadata.evento}` : "") +
        (j.lastError ? `\n     ⚠ error=${j.lastError}` : "")
    );
  });

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
