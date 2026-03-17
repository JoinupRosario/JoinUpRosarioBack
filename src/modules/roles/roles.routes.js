import express from 'express';
import {
  crearRol,
  obtenerRoles,
  obtenerRolPorId,
  actualizarRol,
  cambiarEstadoRol,
  agregarPermiso,
  removerPermiso,
  cambiarEstadoPermiso,
  eliminarRol,
  obtenerPermisos,
  actualizarPermisos
} from './roles.controller.js';
import { verifyToken } from '../../middlewares/auth.js';
import { requirePermission } from '../access/presentation/middlewares/requirePermission.js';

const router = express.Router();

// Todas las rutas de roles requieren autenticación y permiso AMRO (Acceso al módulo Roles)
router.use(verifyToken);
router.use(requirePermission('AMRO'));

// Rutas para roles
router.post('/', crearRol);
router.get('/', obtenerRoles);
router.get('/:id', obtenerRolPorId);
router.put('/:id', actualizarRol);
router.patch('/:id/estado', cambiarEstadoRol);
router.delete('/:id', eliminarRol);

// Ruta para obtener todos los permisos
router.get('/permisos/todos', obtenerPermisos); // Agrega esta línea

// Rutas para gestión de permisos en roles
router.post('/:id/permisos', agregarPermiso);
router.put('/:id/permisos', actualizarPermisos); // Nueva ruta para actualizar todos los permisos

router.delete('/:id/permisos', removerPermiso);
router.patch('/:id/permisos/estado', cambiarEstadoPermiso);

export default router;