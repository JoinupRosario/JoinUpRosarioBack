import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import studentRoutes from "../modules/students/student.routes.js";
import companyRoutes from "../modules/companies/company.routes.js";
import opportunityRoutes from "../modules/opportunities/opportunity.routes.js";
import internshipRoutes from "../modules/internships/internship.routes.js";
import reportRoutes from "../modules/reports/report.routes.js";
import parameterRoutes from "../modules/parameters/parameter.routes.js";
import documentRoutes from "../modules/documents/document.routes.js";
import rolesRoutes from "../modules/roles/roles.routes.js";
import userAdministrativoRoutes from '../modules/usersAdministrativos/userAdministrativo.routes.js';

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/students", studentRoutes);
router.use("/companies", companyRoutes);
router.use("/opportunities", opportunityRoutes);
router.use("/internships", internshipRoutes);
router.use("/reports", reportRoutes);
router.use("/parameters", parameterRoutes);
router.use("/documents", documentRoutes);
router.use("/roles", rolesRoutes);
router.use("/users-administrativos", userAdministrativoRoutes);


export default router;
