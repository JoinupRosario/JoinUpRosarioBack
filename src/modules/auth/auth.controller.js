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

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ message: "Contraseña incorrecta" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

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
    
    res.json({ token, user: userResponse });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
