import dotenv from "dotenv";
import connectDB from "../config/db.js";
import connectMySQL, { query, closePool } from "../config/mysql.js";
import Country from "../modules/shared/location/models/country.schema.js";

dotenv.config();

const migrateCountriesFromMySQL = async () => {
  try {
    console.log('🔄 Iniciando migración de países desde MySQL a MongoDB...');
    
    await connectDB();
    await connectMySQL();
    
    // Consultar todos los países
    const countriesSql = `
      SELECT 
        id AS mysql_id,
        sortname,
        iso_alpha_2,
        iso_numeric,
        name
      FROM country
      ORDER BY id
    `;
    
    const countries = await query(countriesSql);
    console.log(`📊 Se encontraron ${countries.length} países para migrar\n`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const mysqlCountry of countries) {
      try {
        // Verificar si ya existe
        const existing = await Country.findOne({ mysqlId: mysqlCountry.mysql_id });
        
        if (existing) {
          console.log(`⏭️  País ${mysqlCountry.mysql_id} (${mysqlCountry.name}) ya existe, omitiendo...`);
          skipped++;
          continue;
        }
        
        // Construir objeto para MongoDB
        const mongoCountry = {
          mysqlId: mysqlCountry.mysql_id,
          sortname: mysqlCountry.sortname || '',
          isoAlpha2: mysqlCountry.iso_alpha_2 || null,
          isoNumeric: mysqlCountry.iso_numeric || null,
          name: mysqlCountry.name || ''
        };
        
        // Crear en MongoDB
        const createdCountry = await Country.create(mongoCountry);
        console.log(`✅ País ${mysqlCountry.mysql_id} migrado: ${createdCountry.name} (MongoDB ID: ${createdCountry._id})`);
        migrated++;
        
      } catch (error) {
        console.error(`❌ Error migrando país ${mysqlCountry.mysql_id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n📊 Resumen de migración:`);
    console.log(`   ✅ Migrados: ${migrated}`);
    console.log(`   ⏭️  Omitidos: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`\n🎉 Migración de países completada!`);
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error en migración:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
};

migrateCountriesFromMySQL();
