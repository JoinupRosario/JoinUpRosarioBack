import UserAdministrativo from './userAdministrativo.model.js';
import User from '../users/user.model.js';
import Rol from '../roles/roles.model.js';
import bcrypt from 'bcryptjs';

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
      password: await bcrypt.hash(password, 10)
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
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

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
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

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
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado')
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
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

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

    // Eliminar también el usuario base
    await User.findByIdAndDelete(userAdministrativo.user);
    await UserAdministrativo.findByIdAndDelete(id);

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
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

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

    await userAdministrativo.removerRol(rolId);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

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

    await userAdministrativo.cambiarEstadoRol(rolId, estado);

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

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

// Cambiar estado del usuario administrativo (activar/desactivar)
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

    // Actualizar estado en el modelo UserAdministrativo
    userAdministrativo.estado = estado;
    await userAdministrativo.save();

    // Actualizar estado en el modelo User relacionado
    await User.findByIdAndUpdate(userAdministrativo.user, { estado });

    // Obtener el usuario actualizado con populate
    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

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


// NUEVA FUNCIÓN ESCALABLE - Actualizar todos los roles de un usuario de una vez
export const actualizarRolesUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { roles } = req.body; // Array de IDs de roles

    const userAdministrativo = await UserAdministrativo.findById(id);
    if (!userAdministrativo) {
      return res.status(404).json({
        success: false,
        message: 'Usuario administrativo no encontrado'
      });
    }

    // Validar que los roles existan
    if (roles && roles.length > 0) {
      const rolesValidos = await Rol.find({ 
        _id: { $in: roles } 
      });
      
      if (rolesValidos.length !== roles.length) {
        return res.status(400).json({
          success: false,
          message: 'Algunos roles no existen en la base de datos'
        });
      }
    }

    // Reemplazar todos los roles del usuario
    userAdministrativo.roles = roles.map(rolId => ({
      rol: rolId,
      estado: true
    }));

    await userAdministrativo.save();

    const userActualizado = await UserAdministrativo.findById(id)
      .populate('user', 'name email estado')
      .populate('roles.rol', 'nombre estado');

    res.json({
      success: true,
      message: 'Roles actualizados exitosamente',
      data: userActualizado
    });

  } catch (error) {
    console.error('Error al actualizar roles del usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};