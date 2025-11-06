import UserAdministrativo from './userAdministrativo.model.js';
import User from '../users/user.model.js';
import Rol from '../roles/roles.model.js';
import Sucursal from '../sucursales/sucursal.model.js';
import bcrypt from 'bcryptjs';
import { logHelper } from '../logs/log.service.js';

// Crear usuario administrativo (parte actualizada)
export const crearUserAdministrativo = async (req, res) => {
  try {
    const {
      nombres,
      apellidos,
      cargo,
      identificacion,
      telefono,
      extension,
      movil,
      email,
      password,
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

    // Crear usuario base primero
    const nuevoUser = new User({
      name: `${nombres} ${apellidos}`,
      email,
      password: await bcrypt.hash(password, 10),
      modulo: 'administrativo'
    });
    await nuevoUser.save();

    // Crear usuario administrativo
    const nuevoUserAdministrativo = new UserAdministrativo({
      user: nuevoUser._id,
      nombres,
      apellidos,
      cargo,
      identificacion,
      telefono,
      extension,
      movil,
      roles: roles || [],
      estado: estado || 'Inscrito'
    });

    await nuevoUserAdministrativo.save();

    // Populate para devolver datos completos
    const userAdminCompleto = await UserAdministrativo.findById(nuevoUserAdministrativo._id)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

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
        cargo,
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
    const { nombres, apellidos, cargo, telefono, extension, movil, estado } = req.body;

    const userAdministrativo = await UserAdministrativo.findById(id);
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
      cargo: userAdministrativo.cargo,
      telefono: userAdministrativo.telefono,
      estado: userAdministrativo.estado
    };

    // Actualizar campos
    if (nombres) userAdministrativo.nombres = nombres;
    if (apellidos) userAdministrativo.apellidos = apellidos;
    if (cargo !== undefined) userAdministrativo.cargo = cargo;
    if (telefono !== undefined) userAdministrativo.telefono = telefono;
    if (extension !== undefined) userAdministrativo.extension = extension;
    if (movil !== undefined) userAdministrativo.movil = movil;
    if (estado) userAdministrativo.estado = estado;

    await userAdministrativo.save();

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

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
        cargo: userAdministrativo.cargo,
        telefono: userAdministrativo.telefono,
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
    let filtro = {};

    if (estado && estado !== 'todos') {
      filtro.estado = estado;
    }

    if (search) {
      filtro.$or = [
        { nombres: { $regex: search, $options: 'i' } },
        { apellidos: { $regex: search, $options: 'i' } },
        { identificacion: { $regex: search, $options: 'i' } },
        { 'user.email': { $regex: search, $options: 'i' } }
      ];
    }

    const usersAdministrativos = await UserAdministrativo.find(filtro)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: usersAdministrativos,
      total: usersAdministrativos.length
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
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    res.json({
      success: true,
      data: userAdministrativo
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

    await userAdministrativo.agregarRol(rolId);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

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

    await userAdministrativo.removerRol(rolId);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

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

    await userAdministrativo.cambiarEstadoRol(rolId, estado);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

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
      await userAdministrativo.save();

      const userActualizado = await UserAdministrativo.findById(id)
        .populate('user', 'name email estado modulo')
        .populate('roles.rol', 'nombre estado')
        .populate('sucursal', 'nombre codigo');

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
    await userAdministrativo.save();

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

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

    // Actualizar estado en el modelo UserAdministrativo
    userAdministrativo.estado = estado;
    await userAdministrativo.save();

    // Actualizar estado en el modelo User relacionado
    await User.findByIdAndUpdate(userAdministrativo.user, { estado });

    // Obtener el usuario actualizado con populate
    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado modulo')
      .populate('roles.rol', 'nombre estado')
      .populate('sucursal', 'nombre codigo');

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