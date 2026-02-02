import express from "express";
import {
  getItemsByListId,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  getAvailableListIds
} from "./controllers/item.controller.js";

const router = express.Router();

// ==================== ITEMS BY LIST ID (CRUD Genérico) ====================
// Obtener items por listId: GET /api/location/items/:listId?page=1&limit=10&search=...
router.get("/items/:listId", getItemsByListId);

// Obtener un item por ID: GET /api/location/items/item/:id
router.get("/items/item/:id", getItemById);

// Crear nuevo item: POST /api/location/items
router.post("/items", createItem);

// Actualizar item: PUT /api/location/items/:id
router.put("/items/:id", updateItem);

// Eliminar item: DELETE /api/location/items/:id
router.delete("/items/:id", deleteItem);

// Obtener listIds disponibles: GET /api/location/list-ids
router.get("/list-ids", getAvailableListIds);

export default router;
