import { env } from "../config/env.js";
import { logger } from "./logger.js";

// Sends a notification for a saved enquiry through Resend. Returns true when the email was accepted.
export async function sendContactEmail(contact) {
  const { apiKey, from, to } = env.resend;
  if (!apiKey || !from || !to.length) {
    logger.warn("Contact email skipped: set RESEND_API_KEY, CONTACT_FROM_EMAIL and CONTACT_TO_EMAIL in .env");
    return false;
  }

  const phone = contact.phone ? `${contact.countryCode ?? ""} ${contact.phone}`.trim() : "Not provided";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      reply_to: contact.email,
      subject: `New website enquiry from ${contact.name}`,
      text: [
        "New ProvenienceX AI website enquiry",
        `Name: ${contact.name}`,
        `Company: ${contact.company}`,
        `Email: ${contact.email}`,
        `Phone: ${phone}`,
        `Interested in: ${contact.interest || "Not provided"}`,
        "",
        "Message:",
        contact.message,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    logger.error("Resend contact email failed:", response.status, await response.text());
    return false;
  }
  return true;
}
