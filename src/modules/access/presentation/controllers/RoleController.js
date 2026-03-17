/**
 * Controller de roles (módulo access). Delega en use cases.
 */
import { CreateRoleUseCase } from '../../application/use-cases/role/CreateRoleUseCase.js';
import { UpdateRoleUseCase } from '../../application/use-cases/role/UpdateRoleUseCase.js';
import { AssignPermissionsToRoleUseCase } from '../../application/use-cases/role/AssignPermissionsToRoleUseCase.js';
import { GetRoleWithPermissionsUseCase } from '../../application/use-cases/role/GetRoleWithPermissionsUseCase.js';
import { ListRolesUseCase } from '../../application/use-cases/role/ListRolesUseCase.js';
import { RoleRepository } from '../../infrastructure/persistence/mongoose/RoleRepository.js';
import { RoleNotFoundError } from '../../domain/errors/RoleNotFoundError.js';
import { createRoleDTO } from '../dtos/CreateRoleDTO.js';
import { roleResponseDTO } from '../dtos/RoleResponseDTO.js';

const roleRepository = new RoleRepository();
const createRoleUseCase = new CreateRoleUseCase({ roleRepository });
const updateRoleUseCase = new UpdateRoleUseCase({ roleRepository });
const assignPermissionsToRoleUseCase = new AssignPermissionsToRoleUseCase({ roleRepository });
const getRoleWithPermissionsUseCase = new GetRoleWithPermissionsUseCase({ roleRepository });
const listRolesUseCase = new ListRolesUseCase({ roleRepository });

export async function listRoles(req, res) {
  try {
    const enabled = req.query.estado === 'true' ? true : req.query.estado === 'false' ? false : undefined;
    const roles = await listRolesUseCase.execute({ enabled });
    return res.json({ success: true, data: roles, total: roles.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRoleById(req, res) {
  try {
    const role = await getRoleWithPermissionsUseCase.execute({ roleId: req.params.id });
    return res.json({ success: true, data: roleResponseDTO(role) });
  } catch (err) {
    if (err instanceof RoleNotFoundError) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function createRole(req, res) {
  try {
    const dto = createRoleDTO(req.body);
    const role = await createRoleUseCase.execute(dto);
    return res.status(201).json({ success: true, message: 'Rol creado', data: role });
  } catch (err) {
    if (err.message?.includes('Ya existe')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateRole(req, res) {
  try {
    const { name, estado } = req.body;
    const updated = await updateRoleUseCase.execute({
      roleId: req.params.id,
      name,
      enabled: estado
    });
    return res.json({ success: true, message: 'Rol actualizado', data: updated });
  } catch (err) {
    if (err instanceof RoleNotFoundError) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function assignPermissions(req, res) {
  try {
    const permissionIds = req.body?.permisos ?? req.body?.permissionIds ?? [];
    await assignPermissionsToRoleUseCase.execute({
      roleId: req.params.id,
      permissionIds
    });
    const role = await getRoleWithPermissionsUseCase.execute({ roleId: req.params.id });
    return res.json({ success: true, message: 'Permisos actualizados', data: roleResponseDTO(role) });
  } catch (err) {
    if (err instanceof RoleNotFoundError) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}
