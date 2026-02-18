import express from 'express';
import {
  crearUserAdministrativo,
  obtenerUsersAdministrativos,
  obtenerUserAdministrativoPorId,
  actualizarUserAdministrativo,
  eliminarUserAdministrativo,
  agregarRolUserAdministrativo,
  removerRolUserAdministrativo,
  cambiarEstadoRolUserAdministrativo,
  cambiarEstadoUserAdministrativo,
  asociarSedeUserAdministrativo,
  asociarProgramasUserAdministrativo
} from './userAdministrativo.controller.js';
import { verifyToken, authorizeRoles } from '../../middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Rutas para usuarios administrativos
router.post('/', crearUserAdministrativo);
router.get('/', obtenerUsersAdministrativos);
router.get('/:id', obtenerUserAdministrativoPorId);
router.put('/:id', actualizarUserAdministrativo);
router.delete('/:id', eliminarUserAdministrativo);

// Rutas para gestión de roles en usuarios administrativos
router.post('/:id/roles', agregarRolUserAdministrativo);
router.delete('/:id/roles', removerRolUserAdministrativo);
router.patch('/:id/roles/estado', cambiarEstadoRolUserAdministrativo);
router.patch('/:id/estado', cambiarEstadoUserAdministrativo);

// Rutas para gestión de sedes en usuarios administrativos
router.put('/:id/sede', asociarSedeUserAdministrativo);
// Rutas para gestión de programas en usuarios administrativos
router.put('/:id/programas', asociarProgramasUserAdministrativo);

export default router;