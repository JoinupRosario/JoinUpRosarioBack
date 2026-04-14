/**
 * Auditoría (solo lectura): valida la hipótesis de que el paso de historial pisa `finalizada` → `aprobada`
 * y reporta trazabilidad MySQL ↔ Mongo (legacy_entity_mappings vs campo mysqlId en documentos).
 *
 * Uso (desde JoinUpRosarioBack):
 *   node src/seeders/auditMtmLegalEstadosMysqlVsMongo.js
 *
 * Opcional:
 *   AUDIT_MTML_ROW_LIMIT=5000   — máximo filas monitoring_legalized a analizar (0 = todas)
 *   AUDIT_MTML_PRINT_SAMPLES=25 — cuántos ejemplos imprimir por categoría
 *
 * Requiere .env: MONGO_URI, MYSQL_* (igual que el migrador).
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import { mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado } from "./mysqlChangeStatusMappers.js";

dotenv.config();

const LEGACY_MTML = "mtm_legalization";
const LEGACY_MTMO = "mtm_opportunity";
const LEGACY_MTMA = "mtm_application";
const LEGACY_MTM_PLAN = "mtm_plan";
const LEGACY_MTM_SCHED = "mtm_plan_schedule";
const LEGACY_MTM_ACT = "mtm_activity_log";

const COLLECTIONS = {
  oportunidadMTM: "oportunidadmtms",
  postulacionMTM: "postulaciones_mtm",
  legalizacionMTM: "legalizaciones_mtm",
  planMTM: "planes_trabajo_mtm",
  seguimientoMTM: "seguimientos_mtm",
};

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return v == null ? "" : String(v).trim();
}

function parseLimit() {
  const v = process.env.AUDIT_MTML_ROW_LIMIT;
  if (v === undefined || v === "" || v === "0") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sampleLimit() {
  const n = Math.floor(Number(process.env.AUDIT_MTML_PRINT_SAMPLES ?? "20"));
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

async function main() {
  const rowLimit = parseLimit();
  const printN = sampleLimit();

  await connectDB();
  await connectMySQL();

  const db = mongoose.connection.db;

  console.log("\n========== A) MySQL: monitoring_legalized.status vs último change_status_monitoring_legalized ==========\n");

  const limitSql = rowLimit ? `LIMIT ${rowLimit}` : "";
  const mlRows = await query(
    `SELECT monitoring_legalized_id, status FROM monitoring_legalized ORDER BY monitoring_legalized_id ASC ${limitSql}`
  );

  const lastChanges = await query(`
    SELECT c.monitoring_legalized_id, c.status_legalized_after
    FROM change_status_monitoring_legalized c
    INNER JOIN (
      SELECT monitoring_legalized_id, MAX(change_status_monitoring_legalized_id) AS mid
      FROM change_status_monitoring_legalized
      GROUP BY monitoring_legalized_id
    ) t
      ON t.monitoring_legalized_id = c.monitoring_legalized_id
     AND t.mid = c.change_status_monitoring_legalized_id
  `);

  const lastAfterByMl = new Map();
  for (const r of lastChanges || []) {
    const id = num(r.monitoring_legalized_id);
    if (id) lastAfterByMl.set(id, r.status_legalized_after);
  }

  let nCompared = 0;
  let nNoChangeLog = 0;
  /** Fila MySQL → mongo estado distinto al último cambio mapeado */
  let mismatchRowVsLast = 0;
  /** Caso típico sospechoso: fila → finalizada, último cambio → aprobada */
  let rowFinalizadaLastAprobada = 0;
  const samplesMismatch = [];
  const samplesFinalVsAprob = [];

  for (const row of mlRows || []) {
    const mlId = num(row.monitoring_legalized_id);
    if (!mlId) continue;
    nCompared++;
    const rawRow = row.status;
    const estadoDesdeFila = mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(rawRow);
    const lastRaw = lastAfterByMl.get(mlId);
    if (lastRaw == null || str(lastRaw) === "") {
      nNoChangeLog++;
      continue;
    }
    const estadoDesdeUltimoCambio = mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(lastRaw);
    if (estadoDesdeFila !== estadoDesdeUltimoCambio) {
      mismatchRowVsLast++;
      if (samplesMismatch.length < printN) {
        samplesMismatch.push({
          mlId,
          rawFila: str(rawRow),
          mapFila: estadoDesdeFila,
          rawUltimo: str(lastRaw),
          mapUltimo: estadoDesdeUltimoCambio,
        });
      }
    }
    if (estadoDesdeFila === "finalizada" && estadoDesdeUltimoCambio === "aprobada") {
      rowFinalizadaLastAprobada++;
      if (samplesFinalVsAprob.length < printN) {
        samplesFinalVsAprob.push({
          mlId,
          rawFila: str(rawRow),
          rawUltimo: str(lastRaw),
        });
      }
    }
  }

  console.log(`Filas monitoring_legalized analizadas: ${nCompared}`);
  console.log(`Sin filas en change_status (o sin último): ${nNoChangeLog}`);
  console.log(`Distinto mapeo: status fila vs último status_legalized_after: ${mismatchRowVsLast}`);
  console.log(`  └─ Subcaso fila→finalizada y último→aprobada: ${rowFinalizadaLastAprobada}`);
  if (samplesMismatch.length) {
    console.log(`\nEjemplos “cualquier discrepancia fila vs último cambio” (hasta ${printN}):`);
    console.log(JSON.stringify(samplesMismatch, null, 2));
  }
  if (samplesFinalVsAprob.length) {
    console.log(`\nEjemplos fila→finalizada / último→aprobada (hasta ${printN}):`);
    console.log(JSON.stringify(samplesFinalVsAprob, null, 2));
  }

  console.log("\n========== B) Mongo: LegalizacionMTM.estado vs predicción migración ==========\n");

  const mappings = await db.collection("legacy_entity_mappings")
    .find({ scope: LEGACY_MTML })
    .project({ legacyId: 1, mongoId: 1 })
    .toArray();

  const mongoIds = mappings.map((m) => m.mongoId).filter(Boolean);
  const legacyByMongo = new Map(mappings.map((m) => [String(m.mongoId), m.legacyId]));

  const legs = await db
    .collection(COLLECTIONS.legalizacionMTM)
    .find({ _id: { $in: mongoIds } })
    .project({ estado: 1 })
    .toArray();

  const mlById = new Map((mlRows || []).map((r) => [num(r.monitoring_legalized_id), r]));

  let mongoVsLastAgree = 0;
  let mongoVsLastDisagree = 0;
  let mongoVsRowAgree = 0;
  let mongoVsRowDisagree = 0;
  /** Mongo aprobada pero fila MySQL mapeaba finalizada */
  let mongoAprobadaPeroFilaFinalizada = 0;
  const samplesMongoAprobFilaFin = [];

  for (const leg of legs) {
    const mlId = legacyByMongo.get(String(leg._id));
    if (mlId == null) continue;
    const mlRow = mlById.get(mlId);
    if (!mlRow) continue;
    const estadoDesdeFila = mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(mlRow.status);
    const lastRaw = lastAfterByMl.get(mlId);
    const estadoDesdeUltimo =
      lastRaw != null && str(lastRaw) !== ""
        ? mapMysqlChangeStatusMonitoringLegalizedToLegalizacionEstado(lastRaw)
        : null;

    if (estadoDesdeUltimo != null) {
      if (leg.estado === estadoDesdeUltimo) mongoVsLastAgree++;
      else mongoVsLastDisagree++;
    }
    if (leg.estado === estadoDesdeFila) mongoVsRowAgree++;
    else mongoVsRowDisagree++;

    if (estadoDesdeFila === "finalizada" && leg.estado === "aprobada") {
      mongoAprobadaPeroFilaFinalizada++;
      if (samplesMongoAprobFilaFin.length < printN) {
        samplesMongoAprobFilaFin.push({
          mongoId: String(leg._id),
          mlId,
          mongoEstado: leg.estado,
          rawFila: str(mlRow.status),
          rawUltimo: lastRaw != null ? str(lastRaw) : null,
          mapUltimo: estadoDesdeUltimo,
        });
      }
    }
  }

  console.log(`Legalizaciones con mapping MTM: ${legs.length}`);
  console.log(`Coinciden Mongo.estado con map(último change): ${mongoVsLastAgree}`);
  console.log(`Discrepan Mongo.estado vs map(último change): ${mongoVsLastDisagree}`);
  console.log(`Coinciden Mongo.estado con map(status fila): ${mongoVsRowAgree}`);
  console.log(`Discrepan Mongo.estado vs map(status fila): ${mongoVsRowDisagree}`);
  console.log(`Casos: fila→finalizada pero Mongo→aprobada: ${mongoAprobadaPeroFilaFinalizada}`);
  if (samplesMongoAprobFilaFin.length) {
    console.log(`\nEjemplos Mongo aprobada / fila MySQL→finalizada (hasta ${printN}):`);
    console.log(JSON.stringify(samplesMongoAprobFilaFin, null, 2));
  }

  console.log("\n========== C) Trazabilidad mysqlId en documentos vs legacy_entity_mappings ==========\n");

  const scopesMtm = [
    LEGACY_MTMO,
    LEGACY_MTMA,
    LEGACY_MTML,
    LEGACY_MTM_PLAN,
    LEGACY_MTM_SCHED,
    LEGACY_MTM_ACT,
  ];

  for (const scope of scopesMtm) {
    const c = await db.collection("legacy_entity_mappings").countDocuments({ scope });
    console.log(`legacy_entity_mappings scope=${scope}: ${c} filas`);
  }

  const checks = [
    ["oportunidadMTM", COLLECTIONS.oportunidadMTM],
    ["postulacionMTM", COLLECTIONS.postulacionMTM],
    ["legalizacionMTM", COLLECTIONS.legalizacionMTM],
    ["planTrabajoMTM", COLLECTIONS.planMTM],
    ["seguimientoMTM", COLLECTIONS.seguimientoMTM],
  ];

  for (const [label, coll] of checks) {
    const total = await db.collection(coll).estimatedDocumentCount();
    const withMysqlId = await db.collection(coll).countDocuments({
      mysqlId: { $exists: true, $ne: null },
    });
    console.log(`${label} (${coll}): docs=${total}, con campo mysqlId=${withMysqlId}`);
  }

  console.log(
    "\nNota: la migración también puede rellenar `mysqlId` en cada documento MTM (además de `legacy_entity_mappings`).\n"
  );

  await closePool();
  await mongoose.connection.close();
  console.log("Listo.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
