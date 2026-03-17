/**
 * DTO de entrada para crear rol.
 * @param {object} body - req.body
 * @returns {{ name: string, permissionIds: string[], isDefault: boolean }}
 */
export function createRoleDTO(body) {
  return {
    name: body?.name ?? '',
    permissionIds: Array.isArray(body?.permissionIds) ? body.permissionIds : (body?.permisos ? [].concat(body.permisos) : []),
    isDefault: Boolean(body?.isDefault ?? body?.esDefault ?? false)
  };
}
