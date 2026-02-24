import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config(); 

// Configuración de conexión a MySQL
const mysqlConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'tenant-1',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Crear pool de conexiones
let pool = null;

const createPool = () => {
  if (!pool) {
    pool = mysql.createPool(mysqlConfig);
    console.log('✅ Pool de conexiones MySQL creado');
  }
  return pool;
};

// Conectar a MySQL
const connectMySQL = async () => {
  try {
    if (!pool) {
      pool = createPool();
    }
    
    // Probar la conexión
    const connection = await pool.getConnection();
    console.log(`✅ MySQL conectado: ${mysqlConfig.host}`);
    connection.release();
    
    return pool;
  } catch (error) {
    console.error(`❌ Error de conexión MySQL: ${error.message}`);
    throw error;
  }
};

// Obtener el pool (crea uno si no existe)
const getPool = () => {
  if (!pool) {
    return createPool();
  }
  return pool;
};

// Ejecutar una query
const query = async (sql, params = []) => {
  try {
    const pool = getPool();
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error(`❌ Error ejecutando query MySQL: ${error.message}`);
    throw error;
  }
};

// Cerrar todas las conexiones
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Pool de conexiones MySQL cerrado');
  }
};

export {
  connectMySQL,
  getPool,
  query,
  closePool,
  mysqlConfig
};

export default connectMySQL;
