import EmailNotificationJob from "../infrastructure/emailNotificationJob.model.js";
import { sendWithSendGrid } from "../infrastructure/sendGridMailSender.js";
import { resolveEmailsFromDestinatarioKeysAsync } from "./resolveRecipientEmails.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikeHtml(content) {
  return /<\/?[a-z][\s\S]*>/i.test(String(content || ""));
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function notificationBrandingDisabled() {
  return String(process.env.EMAIL_NOTIFICATION_DISABLE_BRANDING || "").trim() === "1";
}

function defaultBrandImageUrl(fileName) {
  const base = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
  return `${String(base).replace(/\/$/, "")}/images/notificaciones/${fileName}`;
}

/** Cabecera institucional (HTML opcional completo vía env). */
function wrapEmailHeaderRow() {
  if (notificationBrandingDisabled()) return "";
  const custom = String(process.env.EMAIL_NOTIFICATION_HEADER_HTML || "").trim();
  if (custom) {
    return `<tr><td style="padding:0;border-bottom:1px solid #e6e8ef;">${custom}</td></tr>`;
  }
  const src = escapeHtml(defaultBrandImageUrl("encabezado.png"));
  return `<tr>
    <td style="padding:0;border-bottom:1px solid #e6e8ef;background:#ffffff;">
      <img
        src="${src}"
        alt="Encabezado Universidad del Rosario"
        style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;text-decoration:none;"
      />
    </td>
  </tr>`;
}

function wrapEmailFooterRow() {
  if (notificationBrandingDisabled()) return "";
  const custom = String(process.env.EMAIL_NOTIFICATION_FOOTER_HTML || "").trim();
  if (custom) {
    return `<tr><td style="padding:0;border-top:1px solid #e6e8ef;">${custom}</td></tr>`;
  }
  const src = escapeHtml(defaultBrandImageUrl("pie.jpg"));
  return `<tr>
    <td style="padding:0;border-top:1px solid #e6e8ef;background:#ffffff;">
      <img
        src="${src}"
        alt="Pie Universidad del Rosario"
        style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;text-decoration:none;"
      />
    </td>
  </tr>`;
}

function wrapEmailHtml(fragment) {
  const body = String(fragment || "").trim();
  const headerRow = wrapEmailHeaderRow();
  const footerRow = wrapEmailFooterRow();
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Notificación</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f6f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:8px;border:1px solid #e6e8ef;overflow:hidden;">
            ${headerRow}
            <tr>
              <td style="padding:24px;color:#1a1a1a;font-size:14px;line-height:1.6;">
                ${body}
              </td>
            </tr>
            ${footerRow}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function cuerpoToHtml(cuerpo) {
  const raw = String(cuerpo || "");
  if (looksLikeHtml(raw)) {
    const alreadyDocument = /<html[\s\S]*<\/html>/i.test(raw);
    return alreadyDocument ? raw : wrapEmailHtml(raw);
  }
  const safeText = escapeHtml(raw).replace(/\r?\n/g, "<br/>");
  return wrapEmailHtml(`<div>${safeText}</div>`);
}

function emailJobMode() {
  const explicit = process.env.EMAIL_JOB_MODE;
  if (explicit === "immediate" || explicit === "mongo") return explicit;
  if (process.env.VERCEL === "1") return "immediate";
  return "mongo";
}

/**
 * Encola o envía correos según plantilla activa ya renderizada.
 * @param {object} params
 * @param {{ asunto: string, cuerpo: string, plantillaId: string, destinatarioKeys: string[] }} params.rendered
 * @param {Record<string, string|string[]|undefined>} params.recipientContext - keys alineadas a destinatarios (coordinador, docente, …)
 * @param {Record<string, unknown>} [params.metadata]
 * @returns {Promise<{ queued: number, immediateSent?: number, recipients: string[] }>}
 */
export async function dispatchRenderedNotification({ rendered, recipientContext, metadata = {} }) {
  if (!rendered?.asunto) {
    return { queued: 0, recipients: [] };
  }
  const keys = rendered.destinatarioKeys || [];
  const recipients =
    keys.length > 0
      ? await resolveEmailsFromDestinatarioKeysAsync(keys, recipientContext)
      : normalizeFallbackRecipients(recipientContext);

  if (recipients.length === 0) {
    console.warn("[notificacion] Sin destinatarios resueltos para evento", metadata);
    return { queued: 0, recipients: [] };
  }

  if (!process.env.SENDGRID_API_KEY?.trim()) {
    console.warn("[notificacion] SENDGRID_API_KEY ausente; no se envían correos.", metadata);
    return { queued: 0, recipients: [], skipped: true };
  }

  const html = cuerpoToHtml(rendered.cuerpo);
  const text = looksLikeHtml(rendered.cuerpo) ? stripHtml(rendered.cuerpo) : rendered.cuerpo || "";
  const mode = emailJobMode();
  const meta = { ...metadata, plantillaId: rendered.plantillaId };

  if (mode === "immediate") {
    let immediateSent = 0;
    for (const to of recipients) {
      try {
        await sendWithSendGrid({ to, subject: rendered.asunto, html, text });
        immediateSent += 1;
      } catch (err) {
        console.error("[notificacion] Envío inmediato falló:", to, err?.message || err);
      }
    }
    return { queued: 0, immediateSent, recipients };
  }

  const docs = recipients.map((to) => ({
    to,
    subject: rendered.asunto,
    html,
    text,
    status: "pending",
    metadata: meta,
  }));
  await EmailNotificationJob.insertMany(docs);
  return { queued: docs.length, recipients };
}

/** Si la plantilla no tiene destinatarios configurados, usar cualquier email presente en el contexto. */
function normalizeFallbackRecipients(context) {
  const out = new Set();
  if (!context || typeof context !== "object") return [];
  for (const v of Object.values(context)) {
    const arr = Array.isArray(v) ? v : [v];
    for (const x of arr) {
      if (typeof x === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim())) {
        out.add(x.trim().toLowerCase());
      }
    }
  }
  return [...out];
}
