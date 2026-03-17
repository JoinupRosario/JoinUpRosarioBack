/**
 * Controller de permisos (módulo access). Delega en use cases.
 */
import { ListPermissionsByModuleUseCase } from '../../application/use-cases/permission/ListPermissionsByModuleUseCase.js';
import { GetPermissionByCodeUseCase } from '../../application/use-cases/permission/GetPermissionByCodeUseCase.js';
import { PermissionRepository } from '../../infrastructure/persistence/mongoose/PermissionRepository.js';
import { PermissionNotFoundError } from '../../domain/errors/PermissionNotFoundError.js';

const permissionRepository = new PermissionRepository();
const listPermissionsByModuleUseCase = new ListPermissionsByModuleUseCase({ permissionRepository });
const getPermissionByCodeUseCase = new GetPermissionByCodeUseCase({ permissionRepository });

export async function listPermissions(req, res) {
  try {
    const module = req.query.module || undefined;
    const list = await listPermissionsByModuleUseCase.execute({ module });
    return res.json({ success: true, data: list, total: list.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getPermissionByCode(req, res) {
  try {
    const code = req.params.code;
    const permission = await getPermissionByCodeUseCase.execute({ code });
    return res.json({ success: true, data: permission });
  } catch (err) {
    if (err instanceof PermissionNotFoundError) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}
