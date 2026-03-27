import dotenv from "dotenv";

dotenv.config();

import connectDB from "../config/db.js";
import { startEmailJobProcessor } from "../modules/notificacion/infrastructure/emailJobProcessor.js";

await connectDB();
startEmailJobProcessor();
console.log("[notificacion] Worker de correo en ejecución (procesa la cola en MongoDB). Ctrl+C para salir.");
