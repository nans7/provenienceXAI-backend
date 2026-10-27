import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer from "nodemailer";
import dns from "node:dns/promises";

process.env.MONGO_URL ??= "mongodb://localhost:27017";
const databaseName = "proveniencex_test";
const { globalConfig } = await import("../src/config/global.server.config.js");
globalConfig.mongoDatabase = databaseName;
process.env.ZEPTOMAIL_ALERTS_PASSWORD = "fake-alerts-password";
process.env.CONTACT_TO_EMAIL = "info@techieamigos.com";
const {createMailUtility,wrapForColorScheme}=await import("../src/utils/send-mail.js");
const {sendContactEmail}=await import("../src/utils/sendContactEmail.js");
const account=()=>({from:"alerts@proveniencex.com",password:"fake-alerts-password"});
const resolveHost=async()=>({address:"203.0.113.10",family:4});
const createUtility=(config,factory)=>createMailUtility(config,factory,resolveHost);

test("all messages share the single configured ZeptoMail transport with verified STARTTLS",async()=>{
 const options=[];const messages=[];
 const utility=createUtility(account(),config=>{options.push(config);return{sendMail:async message=>{messages.push(message);return{accepted:message.to,rejected:[],messageId:"mock-id"};}};});
 for(const subject of ["Contact enquiry","Other transactional message"])await utility.sendEmail({to:"info@techieamigos.com",subject,html:"<p>Test</p>"});
 assert.equal(messages.length,2);assert.equal(options.length,1);
 const config=options[0];assert.equal(config.host,"203.0.113.10");assert.equal(config.tls.servername,"smtp.zeptomail.in");
 assert.equal(config.port,587);assert.equal(config.auth.user,"emailapikey");assert.equal(config.requireTLS,true);assert.equal(config.tls.rejectUnauthorized,true);
 assert.equal(config.logger,false);assert.equal(config.debug,false);assert.equal(config.disableUrlAccess,true);assert.equal(config.disableFileAccess,true);
 assert.ok(messages.every(message=>message.from.address==="alerts@proveniencex.com"));
});

test("HTML fragments are wrapped once and complete documents remain intact",()=>{
 const html='<!DOCTYPE html><html lang="en"><body>Test</body></html>';
 assert.equal(wrapForColorScheme(html),html);
 const wrapped=wrapForColorScheme("<p>Test</p>");assert.match(wrapped,/light only/);assert.equal(wrapForColorScheme(wrapped),wrapped);
});

test("recipient normalization, reply-to, text, and safe subjects are preserved",async()=>{
 let sent;const utility=createUtility(account(),()=>({sendMail:async message=>{sent=message;return{accepted:message.to};}}));
 await utility.sendEmail({to:["INFO@TECHIEAMIGOS.COM","info@techieamigos.com"],replyTo:"visitor@example.com",subject:"Enquiry\r\nNo forged header",text:"Plain body",html:"<p>Body</p>"});
 assert.deepEqual(sent.to,["info@techieamigos.com"]);assert.equal(sent.replyTo,"visitor@example.com");assert.equal(sent.text,"Plain body");assert.doesNotMatch(sent.subject,/[\r\n]/);
});

test("missing credentials and invalid recipients cannot create another transport",async()=>{
 let created=0;const factory=()=>{created++;throw new Error("Must not create a transport");};
 await assert.rejects(createUtility({from:"alerts@proveniencex.com",password:""},factory).sendEmail({to:"info@techieamigos.com",text:"Test"}));
 const utility=createUtility(account(),factory);
 for(const message of [{to:"invalid",text:"Test"},{to:["info@techieamigos.com",{}],text:"Test"},{to:"info@techieamigos.com",replyTo:"invalid",text:"Test"}])await assert.rejects(utility.sendEmail(message));
 assert.equal(created,0);
});

test("SMTP failures are surfaced without exposing transcripts or credentials",async()=>{
 const utility=createUtility(account(),()=>({sendMail:async()=>{throw Object.assign(new Error("secret SMTP transcript"),{code:"EAUTH"});}}));
 await assert.rejects(utility.sendEmail({to:"info@techieamigos.com",text:"Test"}),error=>error.message==="ZeptoMail delivery failed (EAUTH)."&&!error.message.includes("secret"));
});

test("partial recipient rejection fails without retrying through another provider",async()=>{
 const utility=createUtility(account(),()=>({sendMail:async()=>({accepted:["one@example.com"],rejected:["two@example.com"]})}));
 await assert.rejects(utility.sendEmail({to:["one@example.com","two@example.com"],text:"Test"}),/did not accept all recipients/);
});

test("SMTP verification authenticates without sending a message",async()=>{
 let verified=0;const utility=createUtility(account(),()=>({verify:async()=>{verified++;return true;},sendMail:async()=>{throw new Error("Must not send mail");}}));
 assert.equal(await utility.verifyMail(),true);assert.equal(verified,1);
});

test("contact mail uses the active alerts sender and escapes user content",async(context)=>{
 let sent;
 context.mock.method(dns,"lookup",async host=>{assert.equal(host,"smtp.zeptomail.in");return resolveHost();});
 context.mock.method(nodemailer,"createTransport",()=>({sendMail:async message=>{sent=message;return{accepted:message.to};}}));
 assert.equal(await sendContactEmail({name:"Visitor <script>",company:"Example & Co",email:"visitor@example.com",message:"<img src=x onerror=alert(1)>"}),true);
 assert.equal(sent.from.address,"alerts@proveniencex.com");assert.deepEqual(sent.to,["info@techieamigos.com"]);assert.equal(sent.replyTo,"visitor@example.com");
 assert.match(sent.html,/&lt;script&gt;/);assert.match(sent.html,/&lt;img/);assert.doesNotMatch(sent.html,/<script>|<img/);
});

test("stalled mail delivery times out and closes the only transport",async()=>{
 let closed=0;let created=0;
 const utility=createMailUtility(account(),()=>{created++;return{sendMail:()=>new Promise(()=>{}),close:()=>{closed++;}};},resolveHost,15);
 await assert.rejects(utility.sendEmail({to:"info@techieamigos.com",text:"Test"}),/ETIMEDOUT/);assert.equal(created,1);assert.equal(closed,1);
});
