/**
 * Implementación de IPermissionRepository usando Mongoose (modelo Permiso existente).
 */
import Permiso from '../../../../permisos/permiso.model.js';

function toDomain(doc) {
  if (!doc) return null;
  const code = doc.codigo;
  const module = doc.modulo;
  return {
    id: doc._id.toString(),
    code,
    name: doc.nombre,
    module,
    getCodeValue: () => code,
    getModuleValue: () => module
  };
}

export class PermissionRepository {
  async getByCode(code) {
    const normalized = String(code).trim().toUpperCase();
    const doc = await Permiso.findOne({ codigo: normalized }).lean();
    return toDomain(doc);
  }

  async listByModule(module) {
    const normalized = String(module).trim().toUpperCase();
    const docs = await Permiso.find({ modulo: normalized }).sort({ codigo: 1 }).lean();
    return docs.map(toDomain).filter(Boolean);
  }

  async findAll() {
    const docs = await Permiso.find().sort({ modulo: 1, codigo: 1 }).lean();
    return docs.map(toDomain).filter(Boolean);
  }

  async getById(id) {
    const doc = await Permiso.findById(id).lean();
    return toDomain(doc);
  }
}
