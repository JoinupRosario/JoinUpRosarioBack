// userAdministrativo.routes.js - ACTUALIZADO
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
  actualizarRolesUsuario // Agregar esta importación
} from './userAdministrativo.controller.js';

const router = express.Router();

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

// NUEVA RUTA ESCALABLE - Actualizar todos los roles de una vez
router.put('/:id/roles', actualizarRolesUsuario);

// Ruta para cambiar estado del usuario administrativo
router.patch('/:id/estado', cambiarEstadoUserAdministrativo);

export default router;