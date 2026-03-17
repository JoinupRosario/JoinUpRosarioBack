/**
 * Rutas del módulo access (roles, permisos, me/permissions).
 * Permisos no aplicados aún en estas rutas; solo estructura.
 */
import express from 'express';
import { verifyToken } from '../../../../middlewares/auth.js';
import * as RoleController from '../controllers/RoleController.js';
import * as PermissionController from '../controllers/PermissionController.js';
import * as MePermissionsController from '../controllers/MePermissionsController.js';

const router = express.Router();

// Todas las rutas de access requieren token (salvo que se decida dejar públicas algunas)
router.use(verifyToken);

// Permisos del usuario logueado (para el front: mostrar/ocultar botones)
router.get('/me/permissions', MePermissionsController.getMyPermissions);

// Roles (CRUD)
router.get('/roles', RoleController.listRoles);
router.get('/roles/:id', RoleController.getRoleById);
router.post('/roles', RoleController.createRole);
router.put('/roles/:id', RoleController.updateRole);
router.put('/roles/:id/permisos', RoleController.assignPermissions);

// Permisos (catálogo)
router.get('/permissions', PermissionController.listPermissions);
router.get('/permissions/code/:code', PermissionController.getPermissionByCode);

export default router;
