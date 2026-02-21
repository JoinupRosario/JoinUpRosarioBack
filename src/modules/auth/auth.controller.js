import User from "../users/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "Usuario ya existe" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword, role });
    
    // No devolver la contraseña en la respuesta
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Usuario no encontrado" });

    // Solo las entidades externas pueden ingresar por este formulario.
    // Administrativos, estudiantes y postulantes deben usar el Directorio Activo (Office 365).
    if (user.modulo !== "entidades") {
      return res.status(403).json({
        code: "USE_SAML",
        message: "Debe acceder con su cuenta institucional (Office 365). Use el botón 'Ingresar como Comunidad Universitaria'."
      });
    }

    if (!user.estado) {
      return res.status(403).json({ message: "Su cuenta está inactiva. Contacte al administrador." });
    }

    if (!user.password) {
      return res.status(400).json({ message: "Contraseña no configurada. Contacte al administrador." });
    }

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ message: "Contraseña incorrecta" });

    const token = jwt.sign(
      { id: user._id, modulo: user.modulo },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // No devolver la contraseña en la respuesta
    // Asegurar que modulo siempre esté presente (incluso si es null o undefined)
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      modulo: user.modulo !== undefined ? user.modulo : null,
      active: user.estado !== undefined ? user.estado : true,
      estado: user.estado !== undefined ? user.estado : true, // Mantener compatibilidad
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
    // Log para debug
    console.log('=== LOGIN DEBUG ===');
    console.log('Usuario encontrado:', {
      _id: user._id,
      email: user.email,
      modulo: user.modulo,
      moduloType: typeof user.modulo,
      estado: user.estado
    });
    console.log('Respuesta enviada:', {
      ...userResponse,
      modulo: userResponse.modulo,
      moduloType: typeof userResponse.modulo
    });
    console.log('==================');
    
    res.json({ token, user: userResponse });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
