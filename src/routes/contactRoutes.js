import { Router } from "express";
import {
  createContact,
  deleteContact,
  getContactById,
  getContacts,
} from "../controllers/contactController.js";

const router = Router();

router.route("/").post(createContact).get(getContacts);
router.route("/:id").get(getContactById).delete(deleteContact);

export default router;
