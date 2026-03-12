import express from "express";
import {
  list,
  getById,
  getActiveByParametro,
  renderById,
  create,
  update,
  remove,
} from "./plantillaNotificacion.controller.js";
import { verifyToken } from "../../../middlewares/auth.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", list);
router.get("/active/:parametroPlantillaId", getActiveByParametro);
router.get("/:id", getById);
router.post("/render/:id", renderById);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;
