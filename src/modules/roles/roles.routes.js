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

router.use(verifyToken);

// Listar y ver: AMRO o LRO
router.get('/', requirePermission('AMRO', 'LRO'), obtenerRoles);
router.get('/permisos/todos', requirePermission('AMRO', 'LRO'), obtenerPermisos);
router.get('/:id', requirePermission('AMRO', 'LRO'), obtenerRolPorId);

// Crear: AMRO o CRO
router.post('/', requirePermission('AMRO', 'CRO'), crearRol);

// Editar rol y permisos: AMRO o EDRO
router.put('/:id', requirePermission('AMRO', 'EDRO'), actualizarRol);
router.put('/:id/permisos', requirePermission('AMRO', 'EDRO'), actualizarPermisos);
router.post('/:id/permisos', requirePermission('AMRO', 'EDRO'), agregarPermiso);
router.delete('/:id/permisos', requirePermission('AMRO', 'EDRO'), removerPermiso);
router.patch('/:id/permisos/estado', requirePermission('AMRO', 'EDRO'), cambiarEstadoPermiso);

// Activar/desactivar rol: AMRO o CEDRO
router.patch('/:id/estado', requirePermission('AMRO', 'CEDRO'), cambiarEstadoRol);

// Eliminar rol: AMRO o EDRO
router.delete('/:id', requirePermission('AMRO', 'EDRO'), eliminarRol);

export default router;