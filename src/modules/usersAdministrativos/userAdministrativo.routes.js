import express from 'express';
import {
  crearUserAdministrativo,
  obtenerUsersAdministrativos,
  obtenerUserAdministrativoPorId,
  actualizarUserAdministrativo,
  eliminarUserAdministrativo,
  agregarRolUserAdministrativo,
  removerRolUserAdministrativo,
  cambiarEstadoRolUserAdministrativo
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

export default router;