/**
 * Value Object: nombre del módulo del sistema (enum conocido).
 * Sin dependencias externas (dominio puro).
 */
const ALLOWED_MODULES = new Set([
  'EMPRESA', 'POSTULANTES', 'OPORTUNIDADES', 'PRACTICAS', 'MONITORIAS',
  'REPORTES', 'SUCURSALES', 'ROLES', 'USUARIOS', 'CONFIGURACION',
  'PERIODOS', 'ESTADOS_PRACTICA', 'ADJUNTOS', 'FORMULARIOS', 'LISTAS_SISTEMA'
]);

export class ModuleName {
  /** @param {string} value */
  constructor(value) {
    if (value == null || typeof value !== 'string') {
      throw new Error('ModuleName: el valor es obligatorio');
    }
    const normalized = String(value).trim().toUpperCase();
    if (!ALLOWED_MODULES.has(normalized)) {
      throw new Error(`ModuleName: módulo no permitido: ${value}`);
    }
    this._value = normalized;
  }

  value() {
    return this._value;
  }

  equals(other) {
    return other instanceof ModuleName && this._value === other._value;
  }
}
