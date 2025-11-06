import Sucursal from "./sucursal.model.js";

// Obtener todas las sucursales
export const getSucursales = async (req, res) => {
  try {
    const { search, estado } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: "i" } },
        { codigo: { $regex: search, $options: "i" } },
        { direccion: { $regex: search, $options: "i" } }
      ];
    }
    
    if (estado !== undefined) {
      query.estado = estado === "true" || estado === true;
    }
    
    const sucursales = await Sucursal.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      data: sucursales,
      count: sucursales.length
    });
  } catch (error) {
    console.error("Error obteniendo sucursales:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener las sucursales",
      error: error.message
    });
  }
};

// Obtener una sucursal por ID
export const getSucursalById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const sucursal = await Sucursal.findById(id).lean();
    
    if (!sucursal) {
      return res.status(404).json({
        success: false,
        message: "Sucursal no encontrada"
      });
    }
    
    res.json({
      success: true,
      data: sucursal
    });
  } catch (error) {
    console.error("Error obteniendo sucursal:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener la sucursal",
      error: error.message
    });
  }
};

// Crear una nueva sucursal
export const createSucursal = async (req, res) => {
  try {
    const {
      nombre,
      codigo,
      direccion,
      pais,
      ciudad,
      directorioActivo,
      estado
    } = req.body;
    
    // Validar campos requeridos
    if (!nombre || !codigo || !directorioActivo?.tipo || !directorioActivo?.urlBase) {
      return res.status(400).json({
        success: false,
        message: "Los campos nombre, código, tipo de directorio activo y URL base son obligatorios"
      });
    }
    
    // Verificar si ya existe una sucursal con el mismo código
    const existeCodigo = await Sucursal.findOne({ codigo: codigo.toUpperCase() });
    if (existeCodigo) {
      return res.status(400).json({
        success: false,
        message: "Ya existe una sucursal con este código"
      });
    }
    
    const nuevaSucursal = new Sucursal({
      nombre,
      codigo: codigo.toUpperCase(),
      direccion,
      pais,
      ciudad,
      directorioActivo: {
        tipo: directorioActivo.tipo,
        urlBase: directorioActivo.urlBase,
        tipoRespuesta: directorioActivo.tipoRespuesta || "",
        instancia: directorioActivo.instancia || "",
        ubicacionCache: directorioActivo.ubicacionCache || "localStorage",
        clienteId: directorioActivo.clienteId || "",
        urlAutenticacion: directorioActivo.urlAutenticacion || "",
        urlAcceso: directorioActivo.urlAcceso || ""
      },
      estado: estado !== undefined ? estado : true
    });
    
    const sucursalGuardada = await nuevaSucursal.save();
    
    res.status(201).json({
      success: true,
      message: "Sucursal creada exitosamente",
      data: sucursalGuardada
    });
  } catch (error) {
    console.error("Error creando sucursal:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Ya existe una sucursal con este código"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Error al crear la sucursal",
      error: error.message
    });
  }
};

// Actualizar una sucursal
export const updateSucursal = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      codigo,
      direccion,
      pais,
      ciudad,
      directorioActivo,
      estado
    } = req.body;
    
    // Validar campos requeridos
    if (!nombre || !codigo || !directorioActivo?.tipo || !directorioActivo?.urlBase) {
      return res.status(400).json({
        success: false,
        message: "Los campos nombre, código, tipo de directorio activo y URL base son obligatorios"
      });
    }
    
    // Verificar si el código ya existe en otra sucursal
    if (codigo) {
      const existeCodigo = await Sucursal.findOne({ 
        codigo: codigo.toUpperCase(),
        _id: { $ne: id }
      });
      if (existeCodigo) {
        return res.status(400).json({
          success: false,
          message: "Ya existe otra sucursal con este código"
        });
      }
    }
    
    const sucursalActualizada = await Sucursal.findByIdAndUpdate(
      id,
      {
        nombre,
        codigo: codigo ? codigo.toUpperCase() : undefined,
        direccion,
        pais,
        ciudad,
        directorioActivo: directorioActivo ? {
          tipo: directorioActivo.tipo,
          urlBase: directorioActivo.urlBase,
          tipoRespuesta: directorioActivo.tipoRespuesta || "",
          instancia: directorioActivo.instancia || "",
          ubicacionCache: directorioActivo.ubicacionCache || "localStorage",
          clienteId: directorioActivo.clienteId || "",
          urlAutenticacion: directorioActivo.urlAutenticacion || "",
          urlAcceso: directorioActivo.urlAcceso || ""
        } : undefined,
        estado
      },
      { new: true, runValidators: true }
    );
    
    if (!sucursalActualizada) {
      return res.status(404).json({
        success: false,
        message: "Sucursal no encontrada"
      });
    }
    
    res.json({
      success: true,
      message: "Sucursal actualizada exitosamente",
      data: sucursalActualizada
    });
  } catch (error) {
    console.error("Error actualizando sucursal:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Ya existe otra sucursal con este código"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Error al actualizar la sucursal",
      error: error.message
    });
  }
};

// Eliminar una sucursal
export const deleteSucursal = async (req, res) => {
  try {
    const { id } = req.params;
    
    const sucursalEliminada = await Sucursal.findByIdAndDelete(id);
    
    if (!sucursalEliminada) {
      return res.status(404).json({
        success: false,
        message: "Sucursal no encontrada"
      });
    }
    
    res.json({
      success: true,
      message: "Sucursal eliminada exitosamente",
      data: sucursalEliminada
    });
  } catch (error) {
    console.error("Error eliminando sucursal:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la sucursal",
      error: error.message
    });
  }
};

// Cambiar estado de una sucursal
export const toggleEstadoSucursal = async (req, res) => {
  try {
    const { id } = req.params;
    
    const sucursal = await Sucursal.findById(id);
    
    if (!sucursal) {
      return res.status(404).json({
        success: false,
        message: "Sucursal no encontrada"
      });
    }
    
    sucursal.estado = !sucursal.estado;
    await sucursal.save();
    
    res.json({
      success: true,
      message: `Sucursal ${sucursal.estado ? "activada" : "desactivada"} exitosamente`,
      data: sucursal
    });
  } catch (error) {
    console.error("Error cambiando estado de sucursal:", error);
    res.status(500).json({
      success: false,
      message: "Error al cambiar el estado de la sucursal",
      error: error.message
    });
  }
};

