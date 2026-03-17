/**
 * DTO de respuesta para rol (para la API).
 * @param {object} role - Rol de dominio o plain object
 * @returns {object}
 */
export function roleResponseDTO(role) {
  return {
    id: role.id,
    name: role.getNameValue?.() ?? role.name,
    enabled: role.enabled,
    isDefault: role.isDefault,
    permissions: role.permissions || []
  };
}
