import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../modules/users/user.model.js';

dotenv.config();

const createAdminUser = async () => {
  try {
    // Conectar a la base de datos
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya existe un admin
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  Ya existe un usuario administrador:', existingAdmin.email);
      return;
    }

    // Crear usuario administrador
    const adminData = {
      name: 'Administrador General',
      email: 'admin@urosario.edu.co',
      password: await bcrypt.hash('admin123', 10),
      role: 'superadmin',
      active: true
    };

    const admin = await User.create(adminData);
    console.log('✅ Usuario administrador creado exitosamente:');
    console.log('   Email:', admin.email);
    console.log('   Contraseña: admin123');
    console.log('   Rol:', admin.role);

  } catch (error) {
    console.error('❌ Error creando usuario administrador:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
};

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  createAdminUser();
}

export default createAdminUser;
