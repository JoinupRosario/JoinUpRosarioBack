import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error de conexión MongoDB: ${error.message}`);
    // No hacer exit para que el servidor pueda seguir respondiendo
    // El servidor intentará reconectar automáticamente
    console.error("⚠️  El servidor continuará sin conexión a la base de datos");
  }
};

export default connectDB;
