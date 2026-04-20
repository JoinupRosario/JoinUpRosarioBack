import User from "../users/user.model.js";
import UserSucursal from "../userSucursal/userSucursal.model.js";
import Company from "../companies/company.model.js";
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

    // Reglas de acceso por formulario (login con email/contraseña):
    // - isLocal === true: permite login normal en local (desarrollo del módulo estudiante sin SAML)
    // - 'entidades': siempre puede usar el formulario
    // - 'administrativo' sin directorioActivo: puede usar el formulario
    // - 'administrativo' con directorioActivo: debe usar SAML (directorio activo)
    // - 'estudiante' o módulo vacío: SOLO directorio activo (SAML), salvo isLocal
    const isLocalUser = user && (user.isLocal === true || user.isLocal === "true");
    const modulo = user.modulo != null ? String(user.modulo).trim().toLowerCase() : "";

    const puedeUsarFormulario =
      isLocalUser ||
      modulo === "entidades" ||
      (modulo === "administrativo" && !user.directorioActivo);

    if (!puedeUsarFormulario) {
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

    // Si el usuario es contacto de entidad: validar que la empresa esté activa
    // y que el contacto dentro de la empresa también esté activo. Esto evita
    // que un contacto de una empresa inactiva (o un contacto desactivado dentro
    // de una empresa activa) pueda entrar al portal de entidad.
    let companyContext = null;
    if (modulo === "entidades") {
      const company = await Company.findOne({ "contacts.userId": user._id })
        .select("name commercialName legalName status contacts")
        .lean();

      if (!company) {
        return res.status(403).json({
          message:
            "Tu usuario no está asociado a ninguna entidad. Contacta al administrador.",
        });
      }
      if (company.status !== "active") {
        return res.status(403).json({
          message:
            "La entidad a la que perteneces no está activa actualmente. Contacta al administrador.",
        });
      }
      const contacto = (company.contacts || []).find(
        (c) => String(c.userId) === String(user._id)
      );
      if (!contacto) {
        return res.status(403).json({
          message:
            "No se encontró tu contacto dentro de la entidad. Contacta al administrador.",
        });
      }
      const contactoActivo = String(contacto.status || "active").toLowerCase() === "active";
      if (!contactoActivo) {
        return res.status(403).json({
          message:
            "Tu usuario en la entidad está inactivo. Contacta al administrador.",
        });
      }
      companyContext = {
        _id: company._id,
        name: company.commercialName || company.name || company.legalName || "",
        legalName: company.legalName || company.name || "",
        contact: {
          firstName: contacto.firstName,
          lastName: contacto.lastName,
          position: contacto.position || "",
          isPrincipal: !!contacto.isPrincipal,
          isPracticeTutor: !!contacto.isPracticeTutor,
        },
      };
    }

    const token = jwt.sign(
      { id: user._id, modulo: user.modulo },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Sucursales (sedes) del usuario desde user_sucursal
    const userSucursales = await UserSucursal.find({ userId: user._id })
      .populate("sucursalId", "nombre codigo _id")
      .lean();
    const sucursales = userSucursales
      .map((us) => us.sucursalId)
      .filter(Boolean)
      .map((s) => ({ _id: s._id, nombre: s.nombre, codigo: s.codigo }));

    // No devolver la contraseña en la respuesta
    // Asegurar que modulo siempre esté presente (incluso si es null o undefined)
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      modulo: user.modulo !== undefined ? user.modulo : null,
      active: user.estado !== undefined ? user.estado : true,
      estado: user.estado !== undefined ? user.estado : true, // Mantener compatibilidad
      sucursales: sucursales || [],
      debeCambiarPassword: user.debeCambiarPassword === true,
      // Contexto de entidad (solo cuando modulo === 'entidades')
      company: companyContext,
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
