import { Router } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  createContact,
  deleteContact,
  getContactById,
  getContacts,
} from "../controllers/contactController.js";

const router = Router();

router.route("/").post(createContact).get(requireAdmin, getContacts);
router.route("/:id").get(requireAdmin, getContactById).delete(requireAdmin, deleteContact);

export default router;
