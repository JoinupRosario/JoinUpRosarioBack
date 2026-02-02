import dotenv from "dotenv";
import connectDB from "../config/db.js";
import connectMySQL, { query, closePool } from "../config/mysql.js";
import City from "../modules/shared/location/models/city.schema.js";
import State from "../modules/shared/location/models/state.schema.js";

dotenv.config();

const migrateCitiesFromMySQL = async () => {
  try {
    console.log('🔄 Iniciando migración de ciudades desde MySQL a MongoDB...');
    
    await connectDB();
    await connectMySQL();
    
    // Consultar todas las ciudades con información del estado
    const citiesSql = `
      SELECT 
        c.id AS mysql_id,
        c.name,
        c.cod_dian,
        c.state_id AS mysql_state_id
      FROM city c
      ORDER BY c.id
    `;
    
    const cities = await query(citiesSql);
    console.log(`📊 Se encontraron ${cities.length} ciudades para migrar\n`);
    
    // Crear mapa de mysqlStateId -> MongoDB ObjectId
    const stateMap = new Map();
    const allStates = await State.find({});
    allStates.forEach(state => {
      if (state.mysqlId) {
        stateMap.set(state.mysqlId, state._id);
      }
    });
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const mysqlCity of cities) {
      try {
        // Verificar si ya existe
        const existing = await City.findOne({ mysqlId: mysqlCity.mysql_id });
        
        if (existing) {
          console.log(`⏭️  Ciudad ${mysqlCity.mysql_id} (${mysqlCity.name}) ya existe, omitiendo...`);
          skipped++;
          continue;
        }
        
        // Buscar el estado en MongoDB usando el mysqlId
        const stateMongoId = stateMap.get(mysqlCity.mysql_state_id);
        
        if (!stateMongoId) {
          console.log(`⚠️  No se encontró estado con mysqlId ${mysqlCity.mysql_state_id} para ciudad ${mysqlCity.mysql_id}, omitiendo...`);
          skipped++;
          continue;
        }
        
        // Construir objeto para MongoDB
        const mongoCity = {
          mysqlId: mysqlCity.mysql_id,
          name: mysqlCity.name || '',
          codDian: mysqlCity.cod_dian || null,
          state: stateMongoId,
          mysqlStateId: mysqlCity.mysql_state_id
        };
        
        // Crear en MongoDB
        const createdCity = await City.create(mongoCity);
        console.log(`✅ Ciudad ${mysqlCity.mysql_id} migrada: ${createdCity.name} (MongoDB ID: ${createdCity._id})`);
        migrated++;
        
      } catch (error) {
        console.error(`❌ Error migrando ciudad ${mysqlCity.mysql_id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n📊 Resumen de migración:`);
    console.log(`   ✅ Migradas: ${migrated}`);
    console.log(`   ⏭️  Omitidas: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`\n🎉 Migración de ciudades completada!`);
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error en migración:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
};

migrateCitiesFromMySQL();
