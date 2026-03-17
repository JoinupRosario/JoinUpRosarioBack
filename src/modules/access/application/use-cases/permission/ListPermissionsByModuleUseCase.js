/**
 * Caso de uso: listar permisos por módulo (para selects y asignación a roles).
 */
export class ListPermissionsByModuleUseCase {
  /**
   * @param {object} deps
   * @param {import('../../../domain/repositories/IPermissionRepository.js').IPermissionRepository} deps.permissionRepository
   */
  constructor({ permissionRepository }) {
    this.permissionRepository = permissionRepository;
  }

  /**
   * @param {object} input
   * @param {string} [input.module] - Si no se pasa, se devuelven todos (o por defecto ordenados por módulo).
   * @returns {Promise<object[]>}
   */
  async execute({ module }) {
    const list = module
      ? await this.permissionRepository.listByModule(module)
      : await this.permissionRepository.findAll();
    return list.map(p => ({
      id: p.id,
      code: p.getCodeValue?.() ?? p.code,
      name: p.name,
      module: p.getModuleValue?.() ?? p.module
    }));
  }
}
