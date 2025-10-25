import Rol from './roles.model.js';
import Permiso from '../permisos/permiso.model.js';

// Crear un nuevo rol
export const crearRol = async (req, res) => {
  try {
    const { nombre, permisos = [] } = req.body;

    // Verificar si el rol ya existe
    const rolExistente = await Rol.findOne({ nombre });
    if (rolExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un rol con ese nombre'
      });
    }

    // Validar que los permisos existan
    if (permisos.length > 0) {
      const permisosValidos = await Permiso.find({ 
        _id: { $in: permisos } 
      });
      
      if (permisosValidos.length !== permisos.length) {
        return res.status(400).json({
          success: false,
          message: 'Algunos permisos no existen en la base de datos'
        });
      }
    }

    // Crear el rol con los permisos
    const rolData = {
      nombre,
      permisos: permisos.map(permisoId => ({
        permiso: permisoId,
        estado: true
      }))
    };

    const nuevoRol = new Rol(rolData);
    await nuevoRol.save();

    // Populate para devolver los permisos completos
    const rolConPermisos = await Rol.findById(nuevoRol._id)
      .populate('permisos.permiso');

    res.status(201).json({
      success: true,
      message: 'Rol creado exitosamente',
      data: rolConPermisos
    });

  } catch (error) {
    console.error('Error al crear rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener todos los roles
export const obtenerRoles = async (req, res) => {
  try {
    const { estado } = req.query;
    let filtro = {};

    if (estado !== undefined) {
      filtro.estado = estado === 'true';
    }

    const roles = await Rol.find(filtro)
      .populate('permisos.permiso')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: roles,
      total: roles.length
    });

  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener un rol por ID
export const obtenerRolPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const rol = await Rol.findById(id)
      .populate('permisos.permiso');

    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    res.json({
      success: true,
      data: rol
    });

  } catch (error) {
    console.error('Error al obtener rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Actualizar un rol
export const actualizarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;

    const rol = await Rol.findById(id);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Verificar si el nombre ya existe (excluyendo el actual)
    if (nombre && nombre !== rol.nombre) {
      const rolExistente = await Rol.findOne({ 
        nombre, 
        _id: { $ne: id } 
      });
      
      if (rolExistente) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un rol con ese nombre'
        });
      }
    }

    // Actualizar campos
    if (nombre) rol.nombre = nombre;
    if (descripcion !== undefined) rol.descripcion = descripcion;
    if (estado !== undefined) rol.estado = estado;

    await rol.save();

    const rolActualizado = await Rol.findById(id)
      .populate('permisos.permiso');

    res.json({
      success: true,
      message: 'Rol actualizado exitosamente',
      data: rolActualizado
    });

  } catch (error) {
    console.error('Error al actualizar rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Cambiar estado del rol (activar/desactivar)
export const cambiarEstadoRol = async (req, res) => {
  try {
    const { id } = req.params;

    const rol = await Rol.findById(id);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    await rol.cambiarEstado();

    res.json({
      success: true,
      message: `Rol ${rol.estado ? 'activado' : 'desactivado'} exitosamente`,
      data: {
        id: rol._id,
        nombre: rol.nombre,
        estado: rol.estado
      }
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

// Agregar permiso a un rol
export const agregarPermiso = async (req, res) => {
  try {
    const { id } = req.params;
    const { permisoId } = req.body;

    const rol = await Rol.findById(id);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Verificar que el permiso existe
    const permiso = await Permiso.findById(permisoId);
    if (!permiso) {
      return res.status(404).json({
        success: false,
        message: 'Permiso no encontrado'
      });
    }

    await rol.agregarPermiso(permisoId);

    const rolActualizado = await Rol.findById(id)
      .populate('permisos.permiso');

    res.json({
      success: true,
      message: 'Permiso agregado al rol exitosamente',
      data: rolActualizado
    });

  } catch (error) {
    console.error('Error al agregar permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Remover permiso de un rol
export const removerPermiso = async (req, res) => {
  try {
    const { id } = req.params;
    const { permisoId } = req.body;

    const rol = await Rol.findById(id);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    await rol.removerPermiso(permisoId);

    const rolActualizado = await Rol.findById(id)
      .populate('permisos.permiso');

    res.json({
      success: true,
      message: 'Permiso removido del rol exitosamente',
      data: rolActualizado
    });

  } catch (error) {
    console.error('Error al remover permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Cambiar estado de un permiso específico en el rol
export const cambiarEstadoPermiso = async (req, res) => {
  try {
    const { id } = req.params;
    const { permisoId, estado } = req.body;

    const rol = await Rol.findById(id);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    await rol.cambiarEstadoPermiso(permisoId, estado);

    const rolActualizado = await Rol.findById(id)
      .populate('permisos.permiso');

    res.json({
      success: true,
      message: `Permiso ${estado ? 'activado' : 'desactivado'} en el rol exitosamente`,
      data: rolActualizado
    });

  } catch (error) {
    console.error('Error al cambiar estado del permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Eliminar un rol
export const eliminarRol = async (req, res) => {
  try {
    const { id } = req.params;

    const rol = await Rol.findById(id);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Verificar si el rol es default (no se puede eliminar)
    if (rol.esDefault) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un rol por defecto'
      });
    }

    await Rol.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Rol eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
// Actualizar todos los permisos de un rol
export const actualizarPermisos = async (req, res) => {
  try {
    const { id } = req.params;
    const { permisos } = req.body;

    const rol = await Rol.findById(id);
    if (!rol) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }

    // Validar que los permisos existan
    if (permisos && permisos.length > 0) {
      const permisosValidos = await Permiso.find({ 
        _id: { $in: permisos } 
      });
      
      if (permisosValidos.length !== permisos.length) {
        return res.status(400).json({
          success: false,
          message: 'Algunos permisos no existen en la base de datos'
        });
      }
    }

    // Actualizar todos los permisos del rol
    rol.permisos = permisos.map(permisoId => ({
      permiso: permisoId,
      estado: true
    }));

    await rol.save();

    const rolActualizado = await Rol.findById(id)
      .populate('permisos.permiso');

    res.json({
      success: true,
      message: 'Permisos actualizados exitosamente',
      data: rolActualizado
    });

  } catch (error) {
    console.error('Error al actualizar permisos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Agrega esta función al archivo roles.controller.js
export const obtenerPermisos = async (req, res) => {
  try {
    const permisos = await Permiso.find().sort({ modulo: 1, codigo: 1 });
    
    res.json({
      success: true,
      data: permisos,
      total: permisos.length
    });

  } catch (error) {
    console.error('Error al obtener permisos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};