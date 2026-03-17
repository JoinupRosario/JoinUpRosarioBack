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
import { verifyToken } from '../../middlewares/auth.js';
import { requirePermission } from '../access/presentation/middlewares/requirePermission.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyToken);

// AMUS/LUSU = listar y ver; CUSU = crear; EDUS = editar; CEUS = cambiar estado/eliminar; ARUS = asociar roles
router.get('/', requirePermission('AMUS', 'LUSU'), obtenerUsersAdministrativos);
router.get('/:id', requirePermission('AMUS', 'VUSU'), obtenerUserAdministrativoPorId);
router.post('/', requirePermission('CUSU'), crearUserAdministrativo);
router.put('/:id', requirePermission('EDUS'), actualizarUserAdministrativo);
router.delete('/:id', requirePermission('CEUS', 'CEUS2'), eliminarUserAdministrativo);

router.patch('/:id/estado', requirePermission('CEUS', 'CEUS2'), cambiarEstadoUserAdministrativo);

// Gestión de roles en usuarios administrativos
router.post('/:id/roles', requirePermission('ARUS'), agregarRolUserAdministrativo);
router.delete('/:id/roles', requirePermission('ARUS'), removerRolUserAdministrativo);
router.patch('/:id/roles/estado', requirePermission('ARUS'), cambiarEstadoRolUserAdministrativo);

// Gestión de sedes y programas (edición del usuario)
router.put('/:id/sede', requirePermission('EDUS'), asociarSedeUserAdministrativo);
router.put('/:id/programas', requirePermission('EDUS'), asociarProgramasUserAdministrativo);

export default router;