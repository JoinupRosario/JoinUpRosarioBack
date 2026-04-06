/**
 * Añade un rol a un usuario administrativo si aún no lo tiene.
 *
 * Uso:
 *   node src/scripts/addRolUsuarioAdministrativo.js <userAdministrativoId> <rolId>
 *
 * Ejemplo:
 *   node src/scripts/addRolUsuarioAdministrativo.js 6903996658f96fde8f9ded97 68fa8bdebeb4292a5cf782ca
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserAdministrativo from '../modules/usersAdministrativos/userAdministrativo.model.js';

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Falta MONGO_URI en .env');
    process.exit(1);
  }

  const userAdminId = process.argv[2] || '6903996658f96fde8f9ded97';
  const rolId = process.argv[3] || '68fa8bdebeb4292a5cf782ca';

  if (!mongoose.Types.ObjectId.isValid(userAdminId) || !mongoose.Types.ObjectId.isValid(rolId)) {
    console.error('IDs inválidos');
    process.exit(1);
  }

  await mongoose.connect(uri, { connectTimeoutMS: 15000 });

  const doc = await UserAdministrativo.findById(userAdminId);
  if (!doc) {
    console.error(`No existe UserAdministrativo con _id ${userAdminId}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const ya = doc.roles.some((r) => r.rol && r.rol.toString() === rolId);
  if (ya) {
    console.log(`OK: el rol ${rolId} ya estaba en ${doc.nombres} ${doc.apellidos}`);
    await mongoose.disconnect();
    process.exit(0);
  }

  doc.roles.push({ rol: rolId, estado: true });
  await doc.save();

  console.log(`OK: rol ${rolId} añadido a ${doc.nombres} ${doc.apellidos} (${userAdminId})`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
