import mongoose from "mongoose";

/**
 * Relación usuario–sucursal (sedes). Migrada desde MySQL user_branch.
 * Permite N sedes por usuario. Para mostrar "en qué sede está" el usuario.
 */
const userSucursalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sucursalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sucursal",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Índice único compuesto para migración idempotente y evitar duplicados
userSucursalSchema.index({ userId: 1, sucursalId: 1 }, { unique: true });

const UserSucursal = mongoose.model("UserSucursal", userSucursalSchema, "user_sucursal");

export default UserSucursal;
