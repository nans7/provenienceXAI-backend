import { Contact } from "../models/Contact.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendContactEmail } from "../utils/sendContactEmail.js";
import { logger } from "../utils/logger.js";
import { validateContact } from "../utils/validation.js";

export const createContact = asyncHandler(async (req, res) => {
  const validated = validateContact(req.body);
  if (validated.details) throw ApiError.badRequest("Validation failed", validated.details);
  const contact = await Contact.create(validated.data);

  // The enquiry is already saved, so an email failure is logged rather than failing the request.
  const emailSent = await sendContactEmail(contact).catch((error) => {
    logger.error("Contact email error:", error.message);
    return false;
  });

  res.status(201).json({ success: true, message: "Message received", data: { id: contact._id, emailSent } });
});

export const getContacts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger((page - 1) * limit)) {
    throw ApiError.badRequest("Use a positive integer page and a limit between 1 and 100");
  }

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
