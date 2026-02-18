import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Periodo, { TIPO_PERIODO } from "../modules/periodos/periodo.model.js";

dotenv.config();

/** Si es 'true', borra la colección periodos antes de migrar. */
const CLEAR_COLLECTIONS_BEFORE_MIGRATE = process.env.CLEAR_COLLECTIONS_BEFORE_MIGRATE === "true";

/**
 * Migra períodos académicos desde MySQL (tabla academic_period) a MongoDB (colección periodos).
 *
 * Columnas MySQL → modelo:
 *   id → mysqlId
 *   period → codigo
 *   status → estado (normalizado a Activo/Inactivo)
 *   date_initial_period_academic_system / date_final_period_academic_system → fechaSistemaAcademico
 *   date_initial_start_academic_practice / date_final_start_academic_practice → fechaInicioPractica
 *   date_max_end_practice → fechaMaxFinPractica
 *   date_initial_approbation_practice / date_final_approbation_practice → fechaAutorizacion
 *   date_initial_legalization_practice / date_final_legalization_practice → fechaLegalizacion
 *   date_initial_publish_offer / date_final_publish_offer → fechaPublicarOfertas
 *
 * Tipo (practica|monitoria): se infiere por fechas. Si solo tienen valor
 * date_initial_period_academic_system y date_final_period_academic_system y el resto es null → monitoria.
 * Si alguna otra fecha tiene valor → practica.
 *
 * Ejecutar:
 *   node src/seeders/migratePeriodosFromMySQL.js
 *
 * Para vaciar la colección y volver a migrar:
 *   CLEAR_COLLECTIONS_BEFORE_MIGRATE=true node src/seeders/migratePeriodosFromMySQL.js
 */
const migratePeriodosFromMySQL = async () => {
  try {
    console.log("🔄 Migración períodos académicos: MySQL (academic_period) → MongoDB (periodos)\n");

    await connectDB();
    await connectMySQL();

    const dbName = process.env.MYSQL_DATABASE || "tenant-1";
    console.log(`📂 Base MySQL: ${dbName}\n`);

    if (CLEAR_COLLECTIONS_BEFORE_MIGRATE) {
      console.log("🗑️  Limpiando colección periodos...");
      await Periodo.deleteMany({});
      console.log("   ✅ Colección vacía. Iniciando migración.\n");
    }

    const toDate = (v) => (v != null ? new Date(v) : null);
    const toEstado = (v) => {
      if (v == null || v === "") return "Inactivo";
      const s = String(v).trim().toLowerCase();
      if (s === "activo" || s === "active" || s === "1" || s === "true") return "Activo";
      return "Inactivo";
    };

    /** Infiere tipo: si solo sistema académico tiene fechas y el resto es null → monitoria; si no → practica. */
    const inferTipoFromRow = (r) => {
      const hasSistema = r.date_initial_period_academic_system != null || r.date_final_period_academic_system != null;
      const hasPractica =
        r.date_initial_start_academic_practice != null ||
        r.date_final_start_academic_practice != null ||
        r.date_max_end_practice != null ||
        r.date_initial_approbation_practice != null ||
        r.date_final_approbation_practice != null ||
        r.date_initial_legalization_practice != null ||
        r.date_final_legalization_practice != null ||
        r.date_initial_publish_offer != null ||
        r.date_final_publish_offer != null;
      return hasSistema && !hasPractica ? TIPO_PERIODO.MONITORIA : TIPO_PERIODO.PRACTICA;
    };

    const rows = await query(
      `SELECT id, period, status,
        date_initial_period_academic_system, date_final_period_academic_system,
        date_initial_start_academic_practice, date_final_start_academic_practice,
        date_max_end_practice,
        date_initial_approbation_practice, date_final_approbation_practice,
        date_initial_legalization_practice, date_final_legalization_practice,
        date_initial_publish_offer, date_final_publish_offer
       FROM academic_period
       ORDER BY id`
    );

    let migrated = 0;
    let skipped = 0;

    if (rows && rows.length > 0) {
      console.log(`📥 Períodos en MySQL: ${rows.length}`);
      for (const r of rows) {
        const mysqlId = r.id != null ? Number(r.id) : null;
        const existing = await Periodo.findOne({ mysqlId });
        if (existing) {
          skipped++;
          continue;
        }
        await Periodo.create({
          tipo: inferTipoFromRow(r),
          mysqlId,
          codigo: r.period != null ? String(r.period).trim() : "",
          estado: toEstado(r.status),
          fechaSistemaAcademico: {
            inicio: toDate(r.date_initial_period_academic_system),
            fin: toDate(r.date_final_period_academic_system),
          },
          fechaInicioPractica: {
            inicio: toDate(r.date_initial_start_academic_practice),
            fin: toDate(r.date_final_start_academic_practice),
          },
          fechaMaxFinPractica: toDate(r.date_max_end_practice),
          fechaAutorizacion: {
            inicio: toDate(r.date_initial_approbation_practice),
            fin: toDate(r.date_final_approbation_practice),
          },
          fechaLegalizacion: {
            inicio: toDate(r.date_initial_legalization_practice),
            fin: toDate(r.date_final_legalization_practice),
          },
          fechaPublicarOfertas: {
            inicio: toDate(r.date_initial_publish_offer),
            fin: toDate(r.date_final_publish_offer),
          },
        });
        migrated++;
      }
      console.log(`   ✅ Migrados: ${migrated}, omitidos (ya existían): ${skipped}\n`);
    } else {
      console.log("⚠️  No hay registros en la tabla `academic_period`.\n");
    }

    await closePool();
    process.exit(0);
  } catch (error) {
    console.error("💥 Error en migración:", error);
    await closePool().catch(() => {});
    process.exit(1);
  }
};

migratePeriodosFromMySQL();
