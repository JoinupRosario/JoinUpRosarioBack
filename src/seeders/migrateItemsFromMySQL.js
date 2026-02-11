import dotenv from "dotenv";
import connectDB from "../config/db.js";
import connectMySQL, { query } from "../config/mysql.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";

dotenv.config();

const migrateItemsFromMySQL = async () => {
  try {
    console.log('🔄 Iniciando migración de items desde MySQL a MongoDB...');
    
    // Conectar a ambas bases de datos
    await connectDB();
    await connectMySQL();
    
    // Obtener todos los items de MySQL
    console.log('📥 Obteniendo items de MySQL...');
    const mysqlItems = await query('SELECT * FROM `item` ORDER BY id');
    
    if (!mysqlItems || mysqlItems.length === 0) {
      console.log('⚠️  No se encontraron items en MySQL');
      return;
    }
    
    console.log(`📊 Se encontraron ${mysqlItems.length} items en MySQL`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    // Crear un mapa para relacionar mysqlId con ObjectId de MongoDB
    const idMap = new Map();
    
    // Primera pasada: crear todos los items sin parentId
    console.log('📝 Primera pasada: creando items sin relaciones...');
    for (const mysqlItem of mysqlItems) {
      try {
        // Verificar si ya existe (por mysqlId)
        const existing = await Item.findOne({ mysqlId: mysqlItem.id });
        if (existing) {
          console.log(`⏭️  Item con mysqlId ${mysqlItem.id} ya existe, omitiendo...`);
          idMap.set(mysqlItem.id, existing._id);
          skipped++;
          continue;
        }
        
        // Crear el item en MongoDB
        const mongoItem = await Item.create({
          mysqlId: mysqlItem.id,
          value: mysqlItem.value || '',
          valueForReports: mysqlItem.value_for_reports || null,
          valueForCalculations: mysqlItem.value_for_calculations || null,
          description: mysqlItem.description || null,
          mysqlParentId: mysqlItem.parent_id || null,
          status: mysqlItem.status || '',
          listId: mysqlItem.list_id || '',
          sort: mysqlItem.sort || null,
          filters: mysqlItem.filters || null,
          isActive: true
        });
        
        idMap.set(mysqlItem.id, mongoItem._id);
        migrated++;
        
        if (migrated % 100 === 0) {
          console.log(`✅ Migrados ${migrated} items...`);
        }
      } catch (error) {
        console.error(`❌ Error migrando item con mysqlId ${mysqlItem.id}:`, error.message);
        errors++;
      }
    }
    
    // Segunda pasada: actualizar parentId con los ObjectId correctos
    console.log('🔗 Segunda pasada: estableciendo relaciones parentId...');
    let relationsUpdated = 0;
    
    for (const mysqlItem of mysqlItems) {
      if (mysqlItem.parent_id) {
        try {
          const mongoItemId = idMap.get(mysqlItem.id);
          const parentMongoId = idMap.get(mysqlItem.parent_id);
          
          if (mongoItemId && parentMongoId) {
            await Item.updateOne(
              { _id: mongoItemId },
              { $set: { parentId: parentMongoId } }
            );
            relationsUpdated++;
          } else {
            console.warn(`⚠️  No se pudo establecer relación para item ${mysqlItem.id} -> parent ${mysqlItem.parent_id}`);
          }
        } catch (error) {
          console.error(`❌ Error estableciendo relación para item ${mysqlItem.id}:`, error.message);
        }
      }
    }
    
    console.log('\n🎉 Migración completada:');
    console.log(`   ✅ Items migrados: ${migrated}`);
    console.log(`   ⏭️  Items omitidos (ya existían): ${skipped}`);
    console.log(`   🔗 Relaciones establecidas: ${relationsUpdated}`);
    console.log(`   ❌ Errores: ${errors}`);
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error en migración:', error);
    process.exit(1);
  }
};

migrateItemsFromMySQL();
