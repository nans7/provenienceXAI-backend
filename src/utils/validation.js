export function isEmail(value) {
  if (value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local = "", domain = ""] = parts;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) && /^[a-z]{2,63}$/i.test(labels.at(-1) ?? "");
}


const limits = { name: 120, company: 160, email: 254, countryCode: 20, phone: 60, interest: 120, message: 5000 };
const required = ["name", "company", "email", "message"];
export function validateContact(input) {
 if (!input || typeof input !== "object" || Array.isArray(input)) return {details:[{field:"body",message:"Expected an object."}]};
 const data = {};
 const details = [];
 for (const [field, limit] of Object.entries(limits)) {
  if (input[field] !== undefined && typeof input[field] !== "string") { details.push({field,message:field+" must be text."}); continue; }
  const value = (input[field] ?? "").trim();
  data[field] = field === "email" ? value.toLowerCase() : value;
  if (required.includes(field) && !value) details.push({field,message:field+" is required."});
  else if (value.length > limit) details.push({field,message:field+" must be at most "+limit+" characters."});
 }
 if (data.email && !isEmail(data.email)) details.push({field:"email",message:"Enter a valid email address."});
 if (!data.countryCode) data.countryCode = "+91";
 return details.length ? {details} : {data};
}

export const clean = (value) => typeof value === "string" ? value.trim() : "";
export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
