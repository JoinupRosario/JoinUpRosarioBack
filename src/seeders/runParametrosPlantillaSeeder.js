import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { seedParametrosPlantilla } from "./parametrosPlantilla.seeder.js";

dotenv.config();

const run = async () => {
  try {
    await connectDB();
    await seedParametrosPlantilla();
    console.log("🎉 ParametrosPlantilla: seeder finalizado");
    process.exit(0);
  } catch (error) {
    console.error("💥 Error:", error.message);
    process.exit(1);
  }
};

run();
