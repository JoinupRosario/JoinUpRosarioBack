import UserAdministrativo from './userAdministrativo.model.js';
import User from '../users/user.model.js';
import Rol from '../roles/roles.model.js';
import Sucursal from '../sucursales/sucursal.model.js';
import UserSucursal from '../userSucursal/userSucursal.model.js';
import Program from '../program/model/program.model.js';
import bcrypt from 'bcryptjs';
import { logHelper } from '../logs/log.service.js';

/** Obtiene el email del usuario autenticado (req.user.id) para userCreator/userUpdater */
const getCurrentUserEmail = async (req) => {
  try {
    if (req.user?.id) {
      const u = await User.findById(req.user.id).select('email').lean();
      return (u?.email ?? '').toString().trim() || undefined;
    }
  } catch (err) {
    console.warn('getCurrentUserEmail:', err.message);
  }
  return undefined;
};

// Crear usuario administrativo (parte actualizada)
export const crearUserAdministrativo = async (req, res) => {
  try {
    const {
      nombres,
      apellidos,
      tipoIdentificacion,
      identificacion,
      phone,
      email,
      directorioActivo,
      roles,
      estado
    } = req.body;

    // Verificar si ya existe un usuario con ese email
    const userExistente = await User.findOne({ email });
    if (userExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email'
      });
    }

    // Verificar si ya existe un usuario administrativo con esa identificación
    const userAdminExistente = await UserAdministrativo.findOne({ identificacion });
    if (userAdminExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario administrativo con esa identificación'
      });
    }

    // Crear usuario base: sin password si es Directorio Activo (Office 365)
    const userData = {
      name: `${nombres} ${apellidos}`,
      email,
      code: email,
      modulo: 'administrativo',
      directorioActivo: !!directorioActivo
    };
    if (!userData.directorioActivo) {
      const password = req.body.password;
      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña es obligatoria y debe tener al menos 6 caracteres cuando no es Directorio Activo'
        });
      }
      userData.password = await bcrypt.hash(password, 10);
    }
    const nuevoUser = new User(userData);
    await nuevoUser.save();

    const userCreatorEmail = await getCurrentUserEmail(req);

    // Crear usuario administrativo
    const nuevoUserAdministrativo = new UserAdministrativo({
      user: nuevoUser._id,
      nombres,
      apellidos,
      tipoIdentificacion: tipoIdentificacion || undefined,
      identificacion,
      phone: phone || undefined,
      roles: roles || [],
      estado: estado !== undefined ? estado : true,
      userCreator: userCreatorEmail
    });

    await nuevoUserAdministrativo.save();

    // Populate para devolver datos completos
    const userAdminCompleto = await UserAdministrativo.findById(nuevoUserAdministrativo._id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description');

    // Registrar log de creación
    await logHelper.crear(
      req,
      'CREATE',
      'usersAdministrativos',
      `Usuario administrativo creado: ${nombres} ${apellidos} (${identificacion})`,
      nuevoUserAdministrativo._id,
      null,
      {
        nombres,
        apellidos,
        identificacion,
        email,
        directorioActivo: !!directorioActivo,
        rolesCount: roles?.length || 0
      },
      {
        userId: nuevoUser._id,
        email: email
      }
    );

    res.status(201).json({
      success: true,
      message: 'Usuario administrativo creado exitosamente',
      data: userAdminCompleto
    });

  } catch (error) {
    console.error('Error al crear usuario administrativo:', error);
    
    // Si hay error, eliminar el usuario base creado
    if (req.body.email) {
      await User.findOneAndDelete({ email: req.body.email });
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Actualizar usuario administrativo (parte actualizada)
export const actualizarUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombres, apellidos, tipoIdentificacion, phone, directorioActivo, password, estado } = req.body;

    const userAdministrativo = await UserAdministrativo.findById(id).populate('user');
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    // Guardar datos antes para el log
    const datosAntes = {
      nombres: userAdministrativo.nombres,
      apellidos: userAdministrativo.apellidos,
      phone: userAdministrativo.phone,
      estado: userAdministrativo.estado
    };

    // Actualizar campos UserAdministrativo
    if (nombres) userAdministrativo.nombres = nombres;
    if (apellidos) userAdministrativo.apellidos = apellidos;
    if (tipoIdentificacion !== undefined) userAdministrativo.tipoIdentificacion = tipoIdentificacion || null;
    if (phone !== undefined) userAdministrativo.phone = phone;
    if (estado !== undefined) userAdministrativo.estado = estado;

    const userUpdaterEmail = await getCurrentUserEmail(req);
    if (userUpdaterEmail) userAdministrativo.userUpdater = userUpdaterEmail;

    // Actualizar User (nombre, directorioActivo y opcionalmente password)
    if (userAdministrativo.user) {
      const userUpdate = {};
      if (nombres || apellidos) {
        userUpdate.name = [nombres || userAdministrativo.nombres, apellidos || userAdministrativo.apellidos].filter(Boolean).join(' ');
      }
      if (directorioActivo !== undefined) userUpdate.directorioActivo = !!directorioActivo;
      if (!directorioActivo && password && password.length >= 6) {
        userUpdate.password = await bcrypt.hash(password, 10);
      }
      if (Object.keys(userUpdate).length) {
        await User.findByIdAndUpdate(userAdministrativo.user._id, userUpdate);
      }
    }

    await userAdministrativo.save();

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description');

    // Registrar log de actualización
    await logHelper.crear(
      req,
      'UPDATE',
      'usersAdministrativos',
      `Usuario administrativo actualizado: ${userAdministrativo.nombres} ${userAdministrativo.apellidos} (${userAdministrativo.identificacion})`,
      userAdministrativo._id,
      datosAntes,
      {
        nombres: userAdministrativo.nombres,
        apellidos: userAdministrativo.apellidos,
        phone: userAdministrativo.phone,
        estado: userAdministrativo.estado
      }
    );

    res.json({
      success: true,
      message: 'Usuario administrativo actualizado exitosamente',
      data: userActualizado
    });

  } catch (error) {
    console.error('Error al actualizar usuario administrativo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener todos los usuarios administrativos
export const obtenerUsersAdministrativos = async (req, res) => {
  try {
    const { estado, search } = req.query;
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '15', 10)));
    const skip  = (page - 1) * limit;

    let filtro = {};

    // Filtro por estado (true/false o string 'true'/'false')
    if (estado !== undefined && estado !== 'todos' && estado !== '') {
      filtro.estado = estado === 'true' || estado === true;
    }

    // Búsqueda por nombre, apellidos e identificación (campos directos)
    if (search && search.trim()) {
      const re = { $regex: search.trim(), $options: 'i' };
      const baseOr = [
        { nombres:       re },
        { apellidos:     re },
        { identificacion: re },
      ];
      // Email está en la colección User → buscar IDs coincidentes primero
      const usersConEmail = await User.find({ email: re }).select('_id').lean();
      if (usersConEmail.length > 0) {
        baseOr.push({ user: { $in: usersConEmail.map(u => u._id) } });
      }
      filtro.$or = baseOr;
    }

    const [total, usersAdministrativos] = await Promise.all([
      UserAdministrativo.countDocuments(filtro),
      UserAdministrativo.find(filtro)
        .populate('user', 'name email estado modulo directorioActivo')
        .populate('roles.rol', 'nombre estado')
        .populate('sucursal', 'nombre codigo')
        .populate('tipoIdentificacion', 'value description')
        .populate('programas.program', 'name code level')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    // Agregar sucursales desde UserSucursal
    const userIds = [...new Set(usersAdministrativos.map((u) => u.user?._id || u.user).filter(Boolean))];
    const sucursalesByUser = new Map();
    if (userIds.length > 0) {
      const userSucursales = await UserSucursal.find({ userId: { $in: userIds } })
        .populate('sucursalId', 'nombre codigo _id')
        .lean();
      for (const us of userSucursales) {
        const uid = us.userId?.toString();
        if (!uid) continue;
        const arr = sucursalesByUser.get(uid) || [];
        if (us.sucursalId) arr.push({ _id: us.sucursalId._id, nombre: us.sucursalId.nombre, codigo: us.sucursalId.codigo });
        sucursalesByUser.set(uid, arr);
      }
    }

    const data = usersAdministrativos.map((u) => {
      const plain = u.toObject ? u.toObject() : { ...u };
      const uid = (u.user?._id || u.user)?.toString();
      plain.sucursales = uid ? (sucursalesByUser.get(uid) || []) : [];
      return plain;
    });

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error al obtener usuarios administrativos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener usuario administrativo por ID
export const obtenerUserAdministrativoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const userAdministrativo = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description')
      .populate('programas.program', 'name code level');

    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    const userId = userAdministrativo.user?._id || userAdministrativo.user;
    let sucursales = [];
    if (userId) {
      const list = await UserSucursal.find({ userId })
        .populate('sucursalId', 'nombre codigo _id')
        .lean();
      sucursales = list.map((us) => us.sucursalId).filter(Boolean).map((s) => ({ _id: s._id, nombre: s.nombre, codigo: s.codigo }));
    }
    const data = userAdministrativo.toObject ? userAdministrativo.toObject() : { ...userAdministrativo };
    data.sucursales = sucursales;

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error al obtener usuario administrativo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};


// Eliminar usuario administrativo
export const eliminarUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;

    const userAdministrativo = await UserAdministrativo.findById(id);
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    // Guardar datos para el log antes de eliminar
    const datosEliminado = {
      nombres: userAdministrativo.nombres,
      apellidos: userAdministrativo.apellidos,
      identificacion: userAdministrativo.identificacion,
      email: userAdministrativo.user?.email || 'N/A'
    };

    // Eliminar también el usuario base
    await User.findByIdAndDelete(userAdministrativo.user);
    await UserAdministrativo.findByIdAndDelete(id);

    // Registrar log de eliminación
    await logHelper.crear(
      req,
      'DELETE',
      'usersAdministrativos',
      `Usuario administrativo eliminado: ${userAdministrativo.nombres} ${userAdministrativo.apellidos} (${userAdministrativo.identificacion})`,
      id,
      datosEliminado,
      null
    );

    res.json({
      success: true,
      message: 'Usuario administrativo eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar usuario administrativo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Agregar rol a usuario administrativo
export const agregarRolUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;
    const { rolId } = req.body;

    const userAdministrativo = await UserAdministrativo.findById(id);
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    // Verificar que el rol existe
    const rol = await Rol.findById(rolId);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    const userUpdaterEmail = await getCurrentUserEmail(req);
    if (userUpdaterEmail) userAdministrativo.userUpdater = userUpdaterEmail;
    await userAdministrativo.agregarRol(rolId);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description');

    // Registrar log
    await logHelper.crear(
      req,
      'UPDATE',
      'usersAdministrativos',
      `Rol agregado a usuario administrativo: ${userAdministrativo.nombres} ${userAdministrativo.apellidos} - Rol: ${rol.nombre}`,
      userAdministrativo._id,
      null,
      { rolId, rolNombre: rol.nombre },
      { accion: 'agregar_rol' }
    );

    res.json({
      success: true,
      message: 'Rol agregado al usuario exitosamente',
      data: userActualizado
    });

  } catch (error) {
    console.error('Error al agregar rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Remover rol de usuario administrativo
export const removerRolUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;
    const { rolId } = req.body;

    const userAdministrativo = await UserAdministrativo.findById(id);
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    // Obtener info del rol antes de remover
    const rol = await Rol.findById(rolId);

    const userUpdaterEmail = await getCurrentUserEmail(req);
    if (userUpdaterEmail) userAdministrativo.userUpdater = userUpdaterEmail;
    await userAdministrativo.removerRol(rolId);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description');

    // Registrar log
    await logHelper.crear(
      req,
      'UPDATE',
      'usersAdministrativos',
      `Rol removido de usuario administrativo: ${userAdministrativo.nombres} ${userAdministrativo.apellidos} - Rol: ${rol?.nombre || rolId}`,
      userAdministrativo._id,
      null,
      { rolId, rolNombre: rol?.nombre || 'N/A' },
      { accion: 'remover_rol' }
    );

    res.json({
      success: true,
      message: 'Rol removido del usuario exitosamente',
      data: userActualizado
    });

  } catch (error) {
    console.error('Error al remover rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Cambiar estado de rol específico en usuario administrativo
export const cambiarEstadoRolUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;
    const { rolId, estado } = req.body;

    const userAdministrativo = await UserAdministrativo.findById(id);
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    // Obtener estado anterior del rol
    const rolUsuario = userAdministrativo.roles.find(r => r.rol.toString() === rolId);
    const estadoAnterior = rolUsuario?.estado;

    const userUpdaterEmail = await getCurrentUserEmail(req);
    if (userUpdaterEmail) userAdministrativo.userUpdater = userUpdaterEmail;
    await userAdministrativo.cambiarEstadoRol(rolId, estado);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description');

    const rol = await Rol.findById(rolId);

    // Registrar log
    await logHelper.crear(
      req,
      'UPDATE',
      'usersAdministrativos',
      `Estado de rol cambiado para usuario administrativo: ${userAdministrativo.nombres} ${userAdministrativo.apellidos} - Rol: ${rol?.nombre || rolId} (${estadoAnterior} -> ${estado})`,
      userAdministrativo._id,
      { rolId, estadoAnterior },
      { rolId, estado },
      { accion: 'cambiar_estado_rol', rolNombre: rol?.nombre || 'N/A' }
    );

    res.json({
      success: true,
      message: `Rol ${estado ? 'activado' : 'desactivado'} en el usuario exitosamente`,
      data: userActualizado
    });

  } catch (error) {
    console.error('Error al cambiar estado del rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Asociar sede a usuario administrativo
export const asociarSedeUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;
    const { sucursalId } = req.body;

    const userAdministrativo = await UserAdministrativo.findById(id);
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    // Si se envía null o vacío, desasociar la sede
    if (!sucursalId) {
      const sedeAnterior = userAdministrativo.sucursal;
      userAdministrativo.sucursal = null;
      const userUpdaterEmail = await getCurrentUserEmail(req);
      if (userUpdaterEmail) userAdministrativo.userUpdater = userUpdaterEmail;
      await userAdministrativo.save();

      const userActualizado = await UserAdministrativo.findById(id)
        .populate('user', 'name email estado modulo directorioActivo')
        .populate('roles.rol', 'nombre estado')
        .populate('sucursal', 'nombre codigo')
        .populate('tipoIdentificacion', 'value description');

      await logHelper.crear(
        req,
        'UPDATE',
        'usersAdministrativos',
        `Sede desasociada de usuario administrativo: ${userAdministrativo.nombres} ${userAdministrativo.apellidos}`,
        userAdministrativo._id,
        { sucursalId: sedeAnterior },
        { sucursalId: null },
        { accion: 'desasociar_sede' }
      );

      return res.json({
        success: true,
        message: 'Sede desasociada del usuario exitosamente',
        data: userActualizado
      });
    }

    // Verificar que la sucursal existe
    const sucursal = await Sucursal.findById(sucursalId);
    if (!sucursal) {
      return res.status(404).json({
        success: false,
        message: 'Sucursal no encontrada'
      });
    }

    const sedeAnterior = userAdministrativo.sucursal;
    userAdministrativo.sucursal = sucursalId;
    const userUpdaterEmail = await getCurrentUserEmail(req);
    if (userUpdaterEmail) userAdministrativo.userUpdater = userUpdaterEmail;
    await userAdministrativo.save();

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description');

    // Registrar log
    await logHelper.crear(
      req,
      'UPDATE',
      'usersAdministrativos',
      `Sede asociada a usuario administrativo: ${userAdministrativo.nombres} ${userAdministrativo.apellidos} - Sede: ${sucursal.nombre}`,
      userAdministrativo._id,
      { sucursalId: sedeAnterior },
      { sucursalId, sucursalNombre: sucursal.nombre },
      { accion: 'asociar_sede' }
    );

    res.json({
      success: true,
      message: 'Sede asociada al usuario exitosamente',
      data: userActualizado
    });

  } catch (error) {
    console.error('Error al asociar sede:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

export const cambiarEstadoUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const userAdministrativo = await UserAdministrativo.findById(id);
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    const estadoAnterior = userAdministrativo.estado;

    const userUpdaterEmail = await getCurrentUserEmail(req);
    if (userUpdaterEmail) userAdministrativo.userUpdater = userUpdaterEmail;
    userAdministrativo.estado = estado;
    await userAdministrativo.save();

    // Actualizar estado en el modelo User relacionado
    await User.findByIdAndUpdate(userAdministrativo.user, { estado });

    // Obtener el usuario actualizado con populate
    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description');

    // Registrar log
    await logHelper.crear(
      req,
      'UPDATE',
      'usersAdministrativos',
      `Estado de usuario administrativo cambiado: ${userAdministrativo.nombres} ${userAdministrativo.apellidos} (${estadoAnterior} -> ${estado})`,
      userAdministrativo._id,
      { estado: estadoAnterior },
      { estado },
      { accion: 'cambiar_estado_usuario' }
    );

    res.json({
      success: true,
      message: `Usuario ${estado ? 'activado' : 'desactivado'} exitosamente`,
      data: userActualizado
    });

  } catch (error) {
    console.error('Error al cambiar estado del usuario administrativo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Asociar programas a usuario administrativo (reemplaza la lista de programas).
// Optimizado para miles de programas: distinct + updateOne sin cargar el documento.
export const asociarProgramasUserAdministrativo = async (req, res) => {
  try {
    const { id } = req.params;
    const { programIds, asociarTodosActivos } = req.body || {};

    const userUpdaterEmail = await getCurrentUserEmail(req);

    // Solo cargamos nombres para existencia y log (evitamos cargar el array programas)
    const userAdminRef = await UserAdministrativo.findById(id).select('nombres apellidos').lean();
    if (!userAdminRef) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    let ids = [];
    if (asociarTodosActivos === true) {
      // Una sola operación en MongoDB: devuelve solo array de _id (índice status ya existe)
      ids = await Program.distinct('_id', { status: 'ACTIVE' });
    } else {
      ids = Array.isArray(programIds) ? programIds.filter(Boolean) : [];
    }

    const programasPayload = ids.map(programId => ({ program: programId, estado: true }));
    const updateDoc = { programas: programasPayload };
    if (userUpdaterEmail) updateDoc.userUpdater = userUpdaterEmail;

    // Un solo update en BD, sin cargar ni re-guardar el documento
    await UserAdministrativo.updateOne({ _id: id }, { $set: updateDoc });

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo directorioActivo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .populate('tipoIdentificacion', 'value description')
      .populate('programas.program', 'name code level');

    await logHelper.crear(
      req,
      'UPDATE',
      'usersAdministrativos',
      `Programas actualizados para: ${userAdminRef.nombres} ${userAdminRef.apellidos}`,
      id,
      null,
      { programIds: ids.length, asociarTodosActivos: !!asociarTodosActivos },
      { accion: 'asociar_programas' }
    );

    res.json({
      success: true,
      message: 'Programas actualizados correctamente',
      data: userActualizado
    });
  } catch (error) {
    console.error('Error al asociar programas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al asociar programas',
      error: error.message
    });
  }
};