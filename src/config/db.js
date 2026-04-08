import mongoose from "mongoose";
import dns from "node:dns";

/**
 * Opcional (p. ej. Windows + Atlas): en .env poner MONGO_DNS_IPV4_FIRST=1
 * si hay problemas de resolución con mongodb+srv://
 */
if (process.env.MONGO_DNS_IPV4_FIRST === "1") {
  dns.setDefaultResultOrder("ipv4first");
}

function hintMongoConnectionError(err) {
  const msg = err?.message || String(err);
  const code = err?.code;
  if (
    code === "EREFUSED" ||
    msg.includes("querySrv") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("getaddrinfo")
  ) {
    return `
  (DNS / red con mongodb+srv://)
  • No es caché del servidor: falla la consulta DNS SRV a Atlas.
  • Prueba: otra red, desactivar VPN, DNS 8.8.8.8 / 1.1.1.1, o en PowerShell: ipconfig /flushdns
  • En Atlas → Connect → Drivers: usa la cadena "Standard connection string" (mongodb://host1:27017,...)
    en lugar de mongodb+srv:// para evitar querySrv.
  • Local: MONGO_DNS_IPV4_FIRST=1 en .env a veces ayuda en Windows.`;
  }
  return "";
}

const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      return;
    }

    const uri = process.env.MONGO_URI;
    if (!uri || !String(uri).trim()) {
      throw new Error("MONGO_URI no está definida en el entorno");
    }

    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error de conexión MongoDB: ${error.message}`);
    const hint = hintMongoConnectionError(error);
    if (hint) console.error(hint);
    if (process.env.VERCEL !== "1") {
      process.exit(1);
    }
    throw error;
  }
};

export default connectDB;
