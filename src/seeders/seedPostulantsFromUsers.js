import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../modules/users/user.model.js';
import Postulant from '../modules/postulants/models/postulants.schema.js';

dotenv.config();

/**
 * Seeder: crea un postulante por cada usuario existente.
 * Omite usuarios que ya tienen postulante asociado.
 * Rellena todos los campos obligatorios y opcionales con valores por defecto.
 *
 * Ejecutar: npm run seed:postulants
 */
const seedPostulantsFromUsers = async () => {
  try {

    const users = await User.find({}).sort({ createdAt: 1 }).lean();
    if (users.length === 0) {
      console.log('⚠️ No hay usuarios. Crea usuarios primero.');
      return;
    }

    console.log(`📋 Usuarios encontrados: ${users.length}`);

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const existing = await Postulant.findOne({ user: u._id }).lean();
      if (existing) {
        skipped++;
        console.log(`   ⏭️ ${u.email} (${u.code}) — ya tiene postulante`);
        continue;
      }

      const docSuffix = String(i + 1).padStart(5, '0');
      const identity = `SEED-${docSuffix}`;
      const mobile = `310${String(1000000 + i).padStart(7, '0')}`;

      await Postulant.create({
        user: u._id,
        identity_postulant: identity,
        type_doc_postulant: 'CC',
        gender_postulant: i % 2 === 0 ? 'M' : 'F',
        date_nac_postulant: new Date(1995, 0, 1 + (i % 28)),
        estate_postulant: 'activo',
        full_profile: true,
        acept_terms: true,
        phone_number: '6010000000',
        mobile_number: mobile,
        date_register: new Date(),
        years_exp: '0-1',
        time_total_exp: 1,
        wage_aspiration_min: 1000000,
        wage_aspiration_max: 2000000
      });

      created++;
      console.log(`   ✅ ${u.email} (${u.code}) → postulante creado`);
    }

    console.log(`\n🎉 Listo. Creados: ${created}, omitidos: ${skipped}.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error en seedPostulantsFromUsers:', err.message);
    throw err;
  }
};

export default seedPostulantsFromUsers;
