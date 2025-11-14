import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (!authHeader) return res.status(401).json({ message: "Token requerido" });

  try {
    // Extraer el token (puede venir como "Bearer TOKEN" o solo "TOKEN")
    const token = authHeader.startsWith("Bearer ") 
      ? authHeader.split(" ")[1] 
      : authHeader;
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Contiene { id, modulo } según el login
    next();
  } catch (error) {
    res.status(401).json({ message: "Token inválido" });
  }
};

// Función para mapear modulo a role
const mapModuloToRole = (modulo) => {
  const mapping = {
    'entidades': 'company',
    'administrativo': 'admin',
    'estudiante': 'student'
  };
  return mapping[modulo] || modulo;
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Obtener el role desde modulo o directamente desde req.user.role
    const userRole = req.user.role || mapModuloToRole(req.user.modulo);
    
    if (!userRole) {
      return res.status(403).json({ message: "No autorizado: rol no definido" });
    }
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    
    next();
  };
};
