import sgMail from "@sendgrid/mail";

let configured = false;
let configuredKeyTail = null;

function ensureConfigured() {
  const key = process.env.SENDGRID_API_KEY;
  if (!key || !String(key).trim()) {
    throw new Error("SENDGRID_API_KEY no está configurada");
  }
  const trimmed = String(key).trim();
  // Reconfiguramos si la key cambió (evita quedar pegado con un valor viejo).
  if (!configured || trimmed.slice(-6) !== configuredKeyTail) {
    sgMail.setApiKey(trimmed);
    configured = true;
    configuredKeyTail = trimmed.slice(-6);
  }
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

  try {
    const [response] = await sgMail.send(msg);
    console.log(
      `[sendgrid] OK to=${msg.to} from=${msg.from} subject="${msg.subject}"` +
        ` · status=${response?.statusCode}` +
        ` · x-message-id=${response?.headers?.["x-message-id"] || "(n/a)"}`
    );
    return response;
  } catch (err) {
    const status = err?.code || err?.response?.statusCode;
    const body = err?.response?.body;
    const errorsArr = body?.errors;
    const detalle = errorsArr
      ? errorsArr
          .map((e) => `${e.message || ""}${e.field ? ` [field=${e.field}]` : ""}`)
          .join(" | ")
      : "";
    console.error(
      `[sendgrid] FAIL to=${msg.to} from=${msg.from} subject="${msg.subject}"` +
        ` · status=${status || "n/a"}` +
        ` · message="${err?.message || ""}"` +
        (detalle ? ` · sendgrid_errors=[${detalle}]` : "") +
        (body && !errorsArr ? ` · body=${JSON.stringify(body)}` : "")
    );
    throw err;
  }
}
