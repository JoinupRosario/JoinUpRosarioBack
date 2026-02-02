import dotenv from "dotenv";
import connectMySQL, { query } from "../config/mysql.js";

dotenv.config();

const queryDynamicList = async () => {
  try {
    console.log('🔍 Consultando tabla dynamic_list...\n');
    
    await connectMySQL();
    
    const results = await query('SELECT * FROM `dynamic_list`');
    
    console.log(`📊 Se encontraron ${results.length} registros:\n`);
    console.log(JSON.stringify(results, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  }
};

queryDynamicList();
