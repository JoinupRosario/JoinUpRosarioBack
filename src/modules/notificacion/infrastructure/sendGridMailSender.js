import sgMail from "@sendgrid/mail";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const key = process.env.SENDGRID_API_KEY;
  if (!key || !String(key).trim()) {
    throw new Error("SENDGRID_API_KEY no está configurada");
  }
  sgMail.setApiKey(String(key).trim());
  configured = true;
}

export function getDefaultEmailFrom() {
  return (process.env.EMAIL_FROM || "info@mozartai.com.co").trim();
}

/**
 * @param {{ to: string, subject: string, html?: string, text?: string }} params
 */
export async function sendWithSendGrid({ to, subject, html, text }) {
  ensureConfigured();
  const from = getDefaultEmailFrom();
  const msg = {
    to: String(to).trim(),
    from,
    subject: String(subject || "").slice(0, 998),
  };
  if (html) msg.html = html;
  if (text != null && text !== "") msg.text = String(text);
  if (!msg.html && !msg.text) msg.text = "";
  await sgMail.send(msg);
}
