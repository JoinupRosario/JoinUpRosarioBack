import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Si ya está conectado, no hacer nada
    if (mongoose.connection.readyState === 1) {
      return;
    }
    
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error de conexión MongoDB: ${error.message}`);
    // No hacer exit en Vercel para evitar que la función serverless falle
    if (process.env.VERCEL !== "1") {
      process.exit(1);
    }
    throw error; // Lanzar el error para que se maneje arriba
  }
};

export default connectDB;
