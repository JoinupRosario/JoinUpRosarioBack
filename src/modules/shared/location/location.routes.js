import express from "express";
import {
  getItemsByListId,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  getAvailableListIds
} from "./controllers/item.controller.js";
import {
  getCountries,
  getCountryById,
  createCountry,
  updateCountry,
  deleteCountry
} from "./controllers/country.controller.js";
import {
  getStates,
  getStateById,
  createState,
  updateState,
  deleteState
} from "./controllers/state.controller.js";
import {
  getCities,
  getCityById,
  createCity,
  updateCity,
  deleteCity
} from "./controllers/city.controller.js";

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

// ==================== COUNTRIES (CRUD) ====================
router.get("/countries", getCountries);
router.get("/countries/:id", getCountryById);
router.post("/countries", createCountry);
router.put("/countries/:id", updateCountry);
router.delete("/countries/:id", deleteCountry);

// ==================== STATES (CRUD) ====================
router.get("/states", getStates);
router.get("/states/:id", getStateById);
router.post("/states", createState);
router.put("/states/:id", updateState);
router.delete("/states/:id", deleteState);

// ==================== CITIES (CRUD) ====================
router.get("/cities", getCities);
router.get("/cities/:id", getCityById);
router.post("/cities", createCity);
router.put("/cities/:id", updateCity);
router.delete("/cities/:id", deleteCity);

export default router;
