/**
 * Implementación de IRoleRepository usando Mongoose (modelo Rol existente).
 */
import Rol from '../../../../roles/roles.model.js';
import { Role } from '../../../domain/entities/Role.js';

function toDomain(doc) {
  if (!doc) return null;
  const name = doc.nombre;
  const permissions = (doc.permisos || []).map(p => ({
    permissionId: p.permiso?._id ?? p.permiso,
    enabled: p.estado !== false
  }));
  return {
    id: doc._id.toString(),
    getNameValue: () => name,
    name: { value: () => name },
    enabled: doc.estado !== false,
    isDefault: doc.esDefault === true,
    permissions
  };
}

export class RoleRepository {
  async getById(id) {
    const doc = await Rol.findById(id).populate('permisos.permiso').lean();
    return toDomain(doc);
  }

  async findByName(name) {
    const doc = await Rol.findOne({ nombre: name }).populate('permisos.permiso').lean();
    return toDomain(doc);
  }

  async save(role) {
    const isEntity = role instanceof Role;
    const name = isEntity ? role.getNameValue() : (role.getNameValue?.() ?? role.name);
    const enabled = role.enabled !== false;
    const isDefault = role.isDefault === true;
    const permissions = role.permissions || [];

    if (role.id) {
      const doc = await Rol.findById(role.id);
      if (!doc) throw new Error('Rol no encontrado');
      doc.nombre = name;
      doc.estado = enabled;
      doc.esDefault = isDefault;
      doc.permisos = permissions.map(p => ({
        permiso: p.permissionId,
        estado: p.enabled !== false
      }));
      await doc.save();
      const updated = await Rol.findById(doc._id).populate('permisos.permiso').lean();
      return toDomain(updated);
    }

    const newDoc = new Rol({
      nombre: name,
      estado: enabled,
      esDefault: isDefault,
      permisos: permissions.map(p => ({
        permiso: p.permissionId,
        estado: p.enabled !== false
      }))
    });
    await newDoc.save();
    const saved = await Rol.findById(newDoc._id).populate('permisos.permiso').lean();
    const domain = toDomain(saved);
    domain.id = saved._id.toString();
    return domain;
  }

  async findAll(filter = {}) {
    const query = {};
    if (filter.enabled !== undefined) query.estado = filter.enabled;
    const docs = await Rol.find(query).populate('permisos.permiso').sort({ createdAt: -1 }).lean();
    return docs.map(toDomain).filter(Boolean);
  }

  async deleteById(id) {
    const result = await Rol.findByIdAndDelete(id);
    return !!result;
  }
}
