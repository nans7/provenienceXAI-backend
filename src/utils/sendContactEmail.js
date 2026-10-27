import { env } from "../config/credential-config.js";
import { logger } from "./logger.js";
import { sendEmail } from "./send-mail.js";

// Saved contact enquiries use the shared ZeptoMail alerts sender.
export async function sendContactEmail(contact) {
  if (!env.contactToEmails.length || !env.zeptomail.password) {
    logger.warn("Contact email skipped: configure ZEPTOMAIL_ALERTS_PASSWORD and CONTACT_TO_EMAIL.");
    return false;
  }
  const phone = contact.phone ? `${contact.countryCode ?? ""} ${contact.phone}`.trim() : "Not provided";
  const text = [
    "New ProvenienceX AI website enquiry",
    `Name: ${contact.name}`,
    `Company: ${contact.company}`,
    `Email: ${contact.email}`,
    `Phone: ${phone}`,
    `Interested in: ${contact.interest || "Not provided"}`,
    "",
    "Message:",
    contact.message,
  ].join("\n");
  const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[character]);
  await sendEmail({
    to: env.contactToEmails,
    replyTo: contact.email,
    subject: `New website enquiry from ${contact.name}`,
    text,
    html: `<h2>New website enquiry</h2><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(text)}</pre>`,
  });
  return true;
}
