/**
 * Caso de uso: listar roles (opcionalmente filtrado por estado).
 */
export class ListRolesUseCase {
  /**
   * @param {object} deps
   * @param {import('../../../domain/repositories/IRoleRepository.js').IRoleRepository} deps.roleRepository
   */
  constructor({ roleRepository }) {
    this.roleRepository = roleRepository;
  }

  /**
   * @param {object} [input]
   * @param {boolean} [input.enabled]
   * @returns {Promise<object[]>}
   */
  async execute(input = {}) {
    const filter = input.enabled !== undefined ? { enabled: input.enabled } : {};
    const roles = await this.roleRepository.findAll(filter);
    return roles.map(r => ({
      id: r.id,
      name: r.getNameValue?.(),
      enabled: r.enabled,
      isDefault: r.isDefault,
      permissions: r.permissions || []
    }));
  }
}
