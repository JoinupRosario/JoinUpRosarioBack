import dotenv from "dotenv";
import connectDB from "../config/db.js";
import connectMySQL, { query, closePool } from "../config/mysql.js";
import Branch from "../modules/shared/location/models/branch.schema.js";
import Country from "../modules/shared/location/models/country.schema.js";
import City from "../modules/shared/location/models/city.schema.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";

dotenv.config();

/** Si es 'true', vacía la colección branches antes de migrar. */
const CLEAR_BEFORE_MIGRATE = process.env.CLEAR_COLLECTIONS_BEFORE_MIGRATE === "true";

/**
 * Migra sedes (branch) desde MySQL a MongoDB.
 * Requiere tener ya migrados: countries, states, cities, items.
 *
 * Ejecutar: node src/seeders/migrateBranchesFromMySQL.js
 * Vaciar y re-migrar: CLEAR_COLLECTIONS_BEFORE_MIGRATE=true node src/seeders/migrateBranchesFromMySQL.js
 */
const migrateBranchesFromMySQL = async () => {
  try {
    console.log("🔄 Migración de sedes (branch): MySQL → MongoDB\n");

    await connectDB();
    await connectMySQL();

    if (CLEAR_BEFORE_MIGRATE) {
      await Branch.deleteMany({});
      console.log("🗑️  Colección branches vacía.\n");
    }

    const rows = await query(
      "SELECT branch_id, code, name, country, city, address, active_directory, parameter_directory, date_creation, user_creator, date_update, user_updater, status FROM `branch` ORDER BY branch_id"
    );

    if (!rows || rows.length === 0) {
      console.log("⚠️  No hay registros en la tabla `branch`.\n");
      await closePool();
      process.exit(0);
      return;
    }

    console.log(`📥 Sedes en MySQL: ${rows.length}\n`);

    let migrated = 0;
    let skipped = 0;

    for (const r of rows) {
      const pk = r.branch_id != null ? Number(r.branch_id) : null;
      const existing = await Branch.findOne({ $or: [{ mysqlId: pk }, { branchId: r.branch_id }] });
      if (existing) {
        skipped++;
        continue;
      }

      const country = r.country != null ? await Country.findOne({ mysqlId: r.country }) : null;
      const city = r.city != null ? await City.findOne({ mysqlId: r.city }) : null;
      const activeDirectory = r.active_directory != null ? await Item.findOne({ mysqlId: r.active_directory }) : null;

      await Branch.create({
        mysqlId: pk,
        branchId: r.branch_id,
        code: r.code ?? null,
        name: r.name ?? "",
        country: country?._id ?? null,
        city: city?._id ?? null,
        mysqlCountryId: r.country ?? null,
        mysqlCityId: r.city ?? null,
        address: r.address ?? null,
        activeDirectory: activeDirectory?._id ?? null,
        parameterDirectory: r.parameter_directory ?? null,
        dateCreation: r.date_creation ?? null,
        userCreator: r.user_creator ?? null,
        dateUpdate: r.date_update ?? null,
        userUpdater: r.user_updater ?? null,
        status: r.status ?? "ACTIVE",
      });

      migrated++;
    }

    console.log(`   ✅ Sedes migradas: ${migrated}, omitidas: ${skipped}\n`);
    console.log("🎉 Migración de sedes completada.\n");

    await closePool();
    process.exit(0);
  } catch (error) {
    console.error("💥 Error en migración de sedes:", error);
    await closePool().catch(() => {});
    process.exit(1);
  }
};

migrateBranchesFromMySQL();
