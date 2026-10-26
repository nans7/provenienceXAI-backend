import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";
import contactRoutes from "./contactRoutes.js";

const router = Router();

router.get("/health", getHealth);
router.use("/contact", contactRoutes);

export default router;
