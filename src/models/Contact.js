import mongoose from "mongoose";
import { isEmail } from "../utils/validation.js";

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, required: true, trim: true, maxlength: 160 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: { validator: isEmail, message: "Invalid email address" },
    },
    countryCode: { type: String, trim: true, default: "+91", maxlength: 20 },
    phone: { type: String, trim: true, maxlength: 60 },
    interest: { type: String, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true },
);

export const Contact = mongoose.model("Contact", contactSchema);
