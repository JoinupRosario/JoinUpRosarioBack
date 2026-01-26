import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../modules/users/user.model.js';

dotenv.config();

/**
 * Asigna `code` a usuarios que no lo tengan.
 * Formato: U001, U002, U003, ...
 * Ejecutar: npm run seed:backfill-code
 */
const backfillUserCode = async () => {
  try {
    await connectDB();

    const users = await User.find({}).sort({ createdAt: 1 }).lean();
    const withoutCode = users.filter((u) => u.code == null || u.code === '');

    if (withoutCode.length === 0) {
      console.log('✅ Todos los usuarios ya tienen code. Nada que hacer.');
      await mongoose.disconnect();
      process.exit(0);
      return;
    }

    console.log(`📋 Usuarios sin code: ${withoutCode.length}`);

    const used = new Set(users.map((u) => u.code).filter(Boolean));
    let seq = 1;
    const nextCode = () => {
      let c;
      do {
        c = `U${String(seq).padStart(3, '0')}`;
        seq++;
      } while (used.has(c));
      used.add(c);
      return c;
    };

    for (const u of withoutCode) {
      const code = nextCode();
      await User.updateOne(
        { _id: u._id },
        { $set: { code } },
        { runValidators: false }
      );
      console.log(`   ${u.email} → code: ${code}`);
    }

    console.log(`✅ ${withoutCode.length} usuario(s) actualizado(s) con code.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en backfillUserCode:', err.message);
    process.exit(1);
  }
};

backfillUserCode();
