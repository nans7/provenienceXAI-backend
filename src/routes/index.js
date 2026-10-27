import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";
import contactRoutes from "./contactRoutes.js";
import { webHandler } from "../middlewares/webHandler.js";
import { handleAuthRequest } from "../services/auth.service.js";
import { handleHazardRequest } from "../services/hazard.service.js";

const router = Router();

router.get("/health", getHealth);
router.use("/contact", contactRoutes);
router.use("/auth", webHandler(handleAuthRequest));
router.use("/hazard", webHandler(handleHazardRequest));

export default router;
