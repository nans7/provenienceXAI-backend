import { Contact } from "../models/Contact.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendContactEmail } from "../utils/sendContactEmail.js";
import { logger } from "../utils/logger.js";

const FIELDS = ["name", "company", "email", "countryCode", "phone", "interest", "message"];

const pick = (source, keys) =>
  Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));

export const createContact = asyncHandler(async (req, res) => {
  const contact = await Contact.create(pick(req.body, FIELDS));

  // The enquiry is already saved, so an email failure is logged rather than failing the request.
  const emailSent = await sendContactEmail(contact).catch((error) => {
    logger.error("Contact email error:", error.message);
    return false;
  });

  res.status(201).json({ success: true, message: "Message received", data: { id: contact._id, emailSent } });
});

export const getContacts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const [contacts, total] = await Promise.all([
    Contact.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Contact.countDocuments(),
  ]);
  res.json({ success: true, data: contacts, pagination: { page, limit, total } });
});

export const getContactById = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);
  if (!contact) throw ApiError.notFound("Contact not found");
  res.json({ success: true, data: contact });
});

export const deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findByIdAndDelete(req.params.id);
  if (!contact) throw ApiError.notFound("Contact not found");
  res.json({ success: true, message: "Contact deleted" });
});
