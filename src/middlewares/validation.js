// Middleware de validación básico
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: "Datos de entrada inválidos",
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};

// Validaciones comunes
export const commonValidations = {
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  
  password: (value) => {
    return value && value.length >= 6;
  },
  
  phone: (value) => {
    const phoneRegex = /^[0-9+\-\s()]+$/;
    return phoneRegex.test(value);
  },
  
  nit: (value) => {
    const nitRegex = /^[0-9]{9,10}$/;
    return nitRegex.test(value);
  },
  
  studentId: (value) => {
    const studentIdRegex = /^[0-9]{8,12}$/;
    return studentIdRegex.test(value);
  }
};

// Middleware para validar roles
export const validateRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: "No tienes permisos para realizar esta acción",
        requiredRoles: allowedRoles,
        currentRole: req.user.role
      });
    }
    
    next();
  };
};

// Middleware para validar propiedad de recursos
export const validateOwnership = (resourceModel, resourceIdParam = 'id', userIdField = 'user') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({ message: "Recurso no encontrado" });
      }
      
      if (resource[userIdField].toString() !== req.user.id) {
        return res.status(403).json({ message: "No tienes permisos para acceder a este recurso" });
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
};
