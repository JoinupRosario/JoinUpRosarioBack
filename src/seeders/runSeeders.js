import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { seedInitialData, clearData } from "./initialData.js";
import createAdminUser from "./createAdmin.js";

dotenv.config();

const runSeeders = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();
    
    // Verificar argumentos de línea de comandos
    const args = process.argv.slice(2);
    
    if (args.includes("--clear")) {
      await clearData();
    }
    
    // Ejecutar seeders
    await seedInitialData();
    
    // Crear usuario administrador
    await createAdminUser();
    
    console.log("🎉 Proceso completado exitosamente");
    process.exit(0);
  } catch (error) {
    console.error("💥 Error ejecutando seeders:", error.message);
    process.exit(1);
  }
};

runSeeders();
