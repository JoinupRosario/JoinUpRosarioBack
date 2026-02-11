import dotenv from "dotenv";
import connectDB from "../config/db.js";
import connectMySQL, { query } from "../config/mysql.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";

dotenv.config();

const migrateItemsByListId = async () => {
  try {
    console.log('🔄 Iniciando migración de items por list_id...');
    
    await connectDB();
    await connectMySQL();
    
    // Obtener todos los list_id desde dynamic_list
    const dynamicLists = await query('SELECT * FROM `dynamic_list` ORDER BY id');
    
    console.log(`📊 Se encontraron ${dynamicLists.length} list_id en dynamic_list\n`);
    
    // Mostrar los list_id disponibles
    console.log('📋 List_id disponibles:');
    dynamicLists.forEach(dl => {
      console.log(`   - ${dl.id}: ${dl.name}`);
    });
    console.log('');
    
    // Obtener list_id únicos de la tabla item también
    const listIdsFromItems = await query(`
      SELECT DISTINCT list_id 
      FROM \`item\` 
      WHERE list_id IS NOT NULL AND list_id != ''
      ORDER BY list_id
    `);
    
    console.log(`📊 Se encontraron ${listIdsFromItems.length} list_id únicos en la tabla item\n`);
    
    // Primero migrar todos los items a MongoDB (si no están)
    console.log('📥 Migrando todos los items a MongoDB primero...');
    const allItems = await query('SELECT * FROM `item` ORDER BY id');
    
    const idMap = new Map();
    let itemsMigrated = 0;
    
    for (const mysqlItem of allItems) {
      try {
        const existing = await Item.findOne({ mysqlId: mysqlItem.id });
        if (!existing) {
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
            isActive: mysqlItem.status === 'active' || mysqlItem.status === 'ACTIVE'
          });
          idMap.set(mysqlItem.id, mongoItem._id);
          itemsMigrated++;
        } else {
          idMap.set(mysqlItem.id, existing._id);
        }
      } catch (error) {
        console.error(`❌ Error migrando item ${mysqlItem.id}:`, error.message);
      }
    }
    
    // Establecer relaciones parentId
    console.log('🔗 Estableciendo relaciones parentId...');
    for (const mysqlItem of allItems) {
      if (mysqlItem.parent_id) {
        const mongoItemId = idMap.get(mysqlItem.id);
        const parentMongoId = idMap.get(mysqlItem.parent_id);
        if (mongoItemId && parentMongoId) {
          await Item.updateOne(
            { _id: mongoItemId },
            { $set: { parentId: parentMongoId } }
          );
        }
      }
    }
    
    console.log(`✅ ${itemsMigrated} items migrados a MongoDB\n`);
    
    // Mostrar resumen por listId
    console.log('\n📊 Resumen de items por listId:');
    const listIdSummary = await Item.aggregate([
      { $group: { _id: '$listId', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    listIdSummary.forEach(summary => {
      console.log(`   - ${summary._id}: ${summary.count} items`);
    });
    
    console.log('\n🎉 Migración completada! Todos los items están ahora en MongoDB usando el modelo Item.');
    process.exit(0);
  } catch (error) {
    console.error('💥 Error en migración:', error);
    process.exit(1);
  }
};

migrateItemsByListId();
