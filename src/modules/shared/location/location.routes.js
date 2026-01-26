import express from "express";
import {
  getCountries,
  getDepartmentsByCountry,
  getCitiesByDepartment
} from "../controllers/location.controller.js";

const router = express.Router();

//  países
router.get("/countries", getCountries);

//  departamentos
router.get("/countries/:countryId/departments", getDepartmentsByCountry);

//  ciudades
router.get("/departments/:departmentId/cities", getCitiesByDepartment);

export default router;
