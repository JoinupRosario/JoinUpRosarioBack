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
  actualizarPermisosRol
} from './roles.controller.js';

const router = express.Router();

// Rutas para roles
router.post('/', crearRol);
router.get('/', obtenerRoles);
router.get('/:id', obtenerRolPorId);
router.put('/:id', actualizarRol);
router.patch('/:id/estado', cambiarEstadoRol);
router.delete('/:id', eliminarRol);

// Ruta para obtener todos los permisos
router.get('/permisos/todos', obtenerPermisos);

// Rutas para gestión de permisos en roles
router.post('/:id/permisos', agregarPermiso);
router.delete('/:id/permisos', removerPermiso);
router.patch('/:id/permisos/estado', cambiarEstadoPermiso);

// NUEVA RUTA ESCALABLE - Actualizar todos los permisos de una vez
router.put('/:id/permisos', actualizarPermisosRol);

export default router;