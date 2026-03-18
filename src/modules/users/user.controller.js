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

    // Unificar permisos de todos los perfiles UserAdministrativo del usuario
    // (evita inconsistencia cuando hay duplicados o varios perfiles por mismo User)
    const adminProfiles = await UserAdministrativo.find({ user: userId, estado: true })
      .populate({
        path: "roles.rol",
        match: { estado: true },
        populate: {
          path: "permisos.permiso",
          model: "Permiso",
        },
      })
      .lean();

    const permissionsMap = new Map();
    const roleNamesMap = new Map(); // _id -> { _id, nombre } para no duplicar roles

    for (const adminProfile of adminProfiles) {
      for (const roleEntry of adminProfile.roles ?? []) {
        if (!roleEntry.estado || !roleEntry.rol) continue;
        const rol = roleEntry.rol;
        if (!roleNamesMap.has(rol._id.toString())) {
          roleNamesMap.set(rol._id.toString(), { _id: rol._id, nombre: rol.nombre });
        }

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
    }

    return res.json({
      permissions: Array.from(permissionsMap.values()),
      roles: Array.from(roleNamesMap.values()),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Campos de preferencias de notificaciones para postulantes. */
const NOTIF_PREF_FIELDS = [
  "notifActivacionOfertas",
  "notifActivacionOfertasPractica",
  "notifCierreOfertas",
];

/**
 * GET /users/notification-preferences
 * Devuelve las preferencias de notificaciones del usuario (estudiante/postulante).
 */
export const getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select(NOTIF_PREF_FIELDS.join(" "))
      .lean();
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const prefs = {};
    NOTIF_PREF_FIELDS.forEach((key) => {
      prefs[key] = user[key] === true;
    });
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /users/notification-preferences
 * Actualiza las preferencias de notificaciones del usuario (estudiante/postulante).
 */
export const updateNotificationPreferences = async (req, res) => {
  try {
    const update = {};
    NOTIF_PREF_FIELDS.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = !!req.body[key];
    });
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true }
    )
      .select(NOTIF_PREF_FIELDS.join(" "))
      .lean();
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const prefs = {};
    NOTIF_PREF_FIELDS.forEach((key) => {
      prefs[key] = user[key] === true;
    });
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
