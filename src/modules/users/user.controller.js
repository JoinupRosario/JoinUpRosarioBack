import User from "./user.model.js";
import UserAdministrativo from "../usersAdministrativos/userAdministrativo.model.js";
import bcrypt from "bcryptjs";

// Obtener todos los usuarios
export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const filter = {};
    
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    const users = await User.find(filter)
      .select("-password")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener usuario por ID
export const getUserById = async (req, res) => {
  try {
    const userId = req.params.id || req.user.id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar usuario
export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id || req.user.id;
    const { password, ...updateData } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar usuario
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json({ message: "Usuario eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar perfil del usuario actual
export const updateUserProfile = async (req, res) => {
  try {
    const { password, ...updateData } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cambiar contraseña
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verificar contraseña actual
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Contraseña actual incorrecta" });
    }

    // Encriptar nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /users/my-permissions
 * Devuelve los permisos activos del usuario administrativo logueado.
 * Respuesta: { permissions: [{ codigo, nombre, modulo }], roles: [{ nombre }] }
 */
export const getMyPermissions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "No autenticado" });

    const adminProfile = await UserAdministrativo.findOne({ user: userId })
      .populate({
        path: "roles.rol",
        match: { estado: true },
        populate: {
          path: "permisos.permiso",
          model: "Permiso",
        },
      })
      .lean();

    if (!adminProfile) {
      // Usuario autenticado pero sin perfil administrativo: sin permisos
      return res.json({ permissions: [], roles: [] });
    }

    const permissionsMap = new Map();
    const roleNames = [];

    for (const roleEntry of adminProfile.roles ?? []) {
      if (!roleEntry.estado || !roleEntry.rol) continue;
      const rol = roleEntry.rol;
      roleNames.push({ _id: rol._id, nombre: rol.nombre });

      for (const permisoEntry of rol.permisos ?? []) {
        if (!permisoEntry.estado || !permisoEntry.permiso) continue;
        const p = permisoEntry.permiso;
        if (!permissionsMap.has(p.codigo)) {
          permissionsMap.set(p.codigo, {
            codigo: p.codigo,
            nombre: p.nombre,
            modulo: p.modulo,
          });
        }
      }
    }

    return res.json({
      permissions: Array.from(permissionsMap.values()),
      roles: roleNames,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
