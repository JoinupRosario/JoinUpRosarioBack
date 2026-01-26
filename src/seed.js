import dotenv from 'dotenv';
dotenv.config();

import connectDB from './config/db.js';
import seedUsers from './seeders/seedPostulantsFromUsers.js';

const runSeed = async () => {
  try {
    await connectDB();
    await seedUsers();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en seed:', err.message);
    process.exit(1);
  }
};

runSeed();
