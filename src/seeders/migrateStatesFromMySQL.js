import dotenv from "dotenv";
import connectDB from "../config/db.js";
import connectMySQL, { query, closePool } from "../config/mysql.js";
import State from "../modules/shared/location/models/state.schema.js";
import Country from "../modules/shared/location/models/country.schema.js";

dotenv.config();

const migrateStatesFromMySQL = async () => {
  try {
    console.log('🔄 Iniciando migración de estados/departamentos desde MySQL a MongoDB...');
    
    await connectDB();
    await connectMySQL();
    
    // Consultar todos los estados con información del país
    const statesSql = `
      SELECT 
        s.id AS mysql_id,
        s.name,
        s.dian_code,
        s.country_id AS mysql_country_id
      FROM state s
      ORDER BY s.id
    `;
    
    const states = await query(statesSql);
    console.log(`📊 Se encontraron ${states.length} estados para migrar\n`);
    
    // Crear mapa de mysqlCountryId -> MongoDB ObjectId
    const countryMap = new Map();
    const allCountries = await Country.find({});
    allCountries.forEach(country => {
      if (country.mysqlId) {
        countryMap.set(country.mysqlId, country._id);
      }
    });
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const mysqlState of states) {
      try {
        // Verificar si ya existe
        const existing = await State.findOne({ mysqlId: mysqlState.mysql_id });
        
        if (existing) {
          console.log(`⏭️  Estado ${mysqlState.mysql_id} (${mysqlState.name}) ya existe, omitiendo...`);
          skipped++;
          continue;
        }
        
        // Buscar el país en MongoDB usando el mysqlId
        const countryMongoId = countryMap.get(mysqlState.mysql_country_id);
        
        if (!countryMongoId) {
          console.log(`⚠️  No se encontró país con mysqlId ${mysqlState.mysql_country_id} para estado ${mysqlState.mysql_id}, omitiendo...`);
          skipped++;
          continue;
        }
        
        // Construir objeto para MongoDB
        const mongoState = {
          mysqlId: mysqlState.mysql_id,
          name: mysqlState.name || '',
          dianCode: mysqlState.dian_code || null,
          country: countryMongoId,
          mysqlCountryId: mysqlState.mysql_country_id
        };
        
        // Crear en MongoDB
        const createdState = await State.create(mongoState);
        console.log(`✅ Estado ${mysqlState.mysql_id} migrado: ${createdState.name} (MongoDB ID: ${createdState._id})`);
        migrated++;
        
      } catch (error) {
        console.error(`❌ Error migrando estado ${mysqlState.mysql_id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n📊 Resumen de migración:`);
    console.log(`   ✅ Migrados: ${migrated}`);
    console.log(`   ⏭️  Omitidos: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`\n🎉 Migración de estados completada!`);
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error en migración:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
};

migrateStatesFromMySQL();
