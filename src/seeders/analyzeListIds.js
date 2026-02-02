import dotenv from "dotenv";
import connectMySQL, { query } from "../config/mysql.js";

dotenv.config();

const analyzeListIds = async () => {
  try {
    console.log('🔍 Analizando list_id únicos de la tabla item...');
    
    await connectMySQL();
    
    // Obtener todos los list_id únicos con conteo
    const listIds = await query(`
      SELECT list_id, COUNT(*) as count 
      FROM \`item\` 
      WHERE list_id IS NOT NULL AND list_id != ''
      GROUP BY list_id 
      ORDER BY list_id
    `);
    
    console.log(`\n📊 Se encontraron ${listIds.length} list_id únicos:\n`);
    
    // Mostrar todos los list_id
    listIds.forEach((row, index) => {
      console.log(`${index + 1}. ${row.list_id}: ${row.count} items`);
    });
    
    // Obtener algunos ejemplos de cada list_id
    console.log('\n📋 Ejemplos de items por list_id:\n');
    for (const row of listIds.slice(0, 20)) { // Primeros 20 para no saturar
      const examples = await query(`
        SELECT id, value, value_for_reports, description, status, parent_id
        FROM \`item\`
        WHERE list_id = ?
        LIMIT 5
      `, [row.list_id]);
      
      console.log(`\n${row.list_id} (${row.count} items):`);
      examples.forEach(item => {
        console.log(`  - ID: ${item.id}, Value: ${item.value}, Status: ${item.status}, Parent: ${item.parent_id || 'N/A'}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error analizando list_id:', error);
    process.exit(1);
  }
};

analyzeListIds();
