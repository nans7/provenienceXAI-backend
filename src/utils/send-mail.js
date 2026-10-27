import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import nodemailer from "nodemailer";
import { env } from "../config/credential-config.js";
import { isEmail } from "./validation.js";

const SMTP_HOST = "smtp.zeptomail.in";
const SMTP_USER = "emailapikey";
const headerText = (value) => String(value ?? "").replace(/[\r\n]/g, " ").trim();

export function wrapForColorScheme(message) {
  if (/<html[\s>]/i.test(message)) return message;
  return `<!DOCTYPE html><html><head><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;padding:0;">${message}</body></html>`;
}

function recipients(value) {
  const entries = Array.isArray(value) ? value : [value];
  if (!entries.length || entries.some((entry) => typeof entry !== "string")) throw new Error("Provide valid mail recipient addresses.");
  const list = entries.flatMap((entry) => entry.split(",")).map((entry) => entry.trim().toLowerCase());
  if (!list.length || list.some((entry) => !isEmail(entry))) throw new Error("Provide valid mail recipient addresses.");
  return [...new Set(list)];
}

// One ZeptoMail transport implementation for all transactional mail types.
// A transport factory also allows tests to exercise delivery without external mail.
export function createMailUtility(account, createTransport = (options) => nodemailer.createTransport(options), resolveHost = () => dns.lookup(SMTP_HOST, { family: 4 }), timeoutMs = 10000) {
  const transports = new Map();
  async function transportFor() {
    if (!account?.password || !isEmail(account.from ?? "")) throw new Error("ZeptoMail sender is not configured.");
    // Resolve using the operating system: some local DNS servers stall on the
    // library's parallel IPv6 query even when IPv4 resolves. TLS still verifies
    // the original ZeptoMail hostname; no IP address is hardcoded.
    const { address } = await resolveHost();
    const signature = createHash("sha256").update(`${account.from}\0${account.password}\0${address}`).digest("hex");
    if (!transports.has(signature)) {
      transports.set(signature, createTransport({
        host: address,
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: SMTP_USER, pass: account.password },
        tls: { servername: SMTP_HOST, minVersion: "TLSv1.2", rejectUnauthorized: true },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
      }));
    }
    return { account, transport: transports.get(signature), signature };
  }

  async function withTransport(operation) {
    let active;
    let expired = false;
    let timer;
    const work = (async () => {
      active = await transportFor();
      if (expired) { transports.delete(active.signature); throw new Error("SMTP deadline exceeded."); }
      return operation(active);
    })();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        if (active) {
          transports.delete(active.signature);
          try { active.transport.close?.(); } catch { /* Best-effort socket cleanup. */ }
        }
        reject(Object.assign(new Error("SMTP deadline exceeded."), { code: "ETIMEDOUT" }));
      }, timeoutMs);
    });
    try { return await Promise.race([work, deadline]); }
    finally { clearTimeout(timer); }
  }

  async function sendEmail({ to, subject = "ProvenienceX AI", html, text, replyTo }) {
    const addresses = recipients(to);
    if (replyTo && !isEmail(replyTo)) throw new Error("Provide a valid reply-to address.");
    if (!html && !text) throw new Error("Provide an email body.");
    let info;
    try {
      info = await withTransport(({ account, transport }) => transport.sendMail({
        from: { name: "ProvenienceX AI", address: account.from },
        to: addresses,
        subject: headerText(subject),
        ...(html ? { html: wrapForColorScheme(html) } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { replyTo } : {}),
      }));
    } catch (error) { throw new Error(`ZeptoMail delivery failed (${error?.code ?? "SMTP_ERROR"}).`); }
    const accepted = new Set((info.accepted ?? []).map((address) => String(address).toLowerCase()));
    if (info.rejected?.length || addresses.some((address) => !accepted.has(address))) throw new Error("ZeptoMail did not accept all recipients.");
    return { messageId: info.messageId, accepted: addresses };
  }

  async function verifyMail() {
    try { return await withTransport(({ transport }) => transport.verify()); }
    catch (error) { throw new Error(`ZeptoMail verification failed (${error?.code ?? "SMTP_ERROR"}).`); }
  }

  return { sendEmail, verifyMail };
}

const utility = createMailUtility(env.zeptomail);
export const sendEmail = utility.sendEmail;
export const verifyMail = utility.verifyMail;
