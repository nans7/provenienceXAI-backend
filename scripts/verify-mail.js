import { verifyMail } from "../src/utils/send-mail.js";

// Connection/authentication only; no message is sent.
try {
  await verifyMail();
  console.log("ZeptoMail: SMTP authentication verified");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
