import UserSucursal from "./userSucursal.model.js";

/**
 * Obtiene las sucursales (sedes) del usuario actual.
 * GET /api/user-sucursales
 */
export const getSucursalesByCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const list = await UserSucursal.find({ userId })
      .populate("sucursalId", "nombre codigo _id")
      .lean();

    const sucursales = list
      .map((item) => item.sucursalId)
      .filter(Boolean)
      .map((s) => ({ _id: s._id, nombre: s.nombre, codigo: s.codigo }));

    res.json({ sucursales });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Obtiene las sucursales de un usuario por su ID (User._id).
 * GET /api/user-sucursales/:userId
 */
export const getSucursalesByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const list = await UserSucursal.find({ userId })
      .populate("sucursalId", "nombre codigo _id")
      .lean();

    const sucursales = list
      .map((item) => item.sucursalId)
      .filter(Boolean)
      .map((s) => ({ _id: s._id, nombre: s.nombre, codigo: s.codigo }));

    res.json({ sucursales });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
