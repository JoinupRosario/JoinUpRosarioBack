import EmailNotificationJob from "./emailNotificationJob.model.js";
import { sendWithSendGrid } from "./sendGridMailSender.js";

const POLL_MS = Math.max(2000, parseInt(process.env.EMAIL_JOB_POLL_MS || "5000", 10) || 5000);
const BATCH = Math.min(50, Math.max(1, parseInt(process.env.EMAIL_JOB_BATCH || "8", 10) || 8));
const MAX_ATTEMPTS = Math.max(1, parseInt(process.env.EMAIL_JOB_MAX_ATTEMPTS || "3", 10) || 3);

async function processOneJob() {
  const job = await EmailNotificationJob.findOneAndUpdate(
    { status: "pending" },
    {
      $set: {
        status: "processing",
        processingStartedAt: new Date(),
      },
    },
    { sort: { createdAt: 1 }, new: true }
  );

  if (!job) return false;

  try {
    await sendWithSendGrid({
      to: job.to,
      subject: job.subject,
      html: job.html || undefined,
      text: job.text || undefined,
    });
    await EmailNotificationJob.updateOne(
      { _id: job._id },
      { $set: { status: "sent", sentAt: new Date(), lastError: null, processingStartedAt: null } }
    );
  } catch (err) {
    const attempts = (job.attempts || 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await EmailNotificationJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: failed ? "failed" : "pending",
          attempts,
          lastError: String(err?.message || err).slice(0, 2000),
          processingStartedAt: null,
        },
      }
    );
    console.error("[notificacion] Job correo falló:", job.to, err?.message || err);
  }
  return true;
}

async function processBatch() {
  for (let i = 0; i < BATCH; i += 1) {
    const worked = await processOneJob();
    if (!worked) break;
  }
}

/**
 * Procesa jobs `pending` en segundo plano. Desactivar en API serverless duplicado con ENABLE_EMAIL_WORKER=0.
 * @returns {() => void} stop
 */
export function startEmailJobProcessor() {
  if (process.env.ENABLE_EMAIL_WORKER === "0") {
    return () => {};
  }
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    processBatch().catch((e) => console.error("[notificacion] emailJobProcessor:", e));
  };
  const id = setInterval(tick, POLL_MS);
  tick();
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
