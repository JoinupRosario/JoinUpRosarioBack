/**
 * Lista hasta N opportunity.id (MySQL) de monitoría con cadena completa para
 * MIGRATION_FOCUS_MTM_OPP_IDS en migrateOpportunitiesFromMySQL.js.
 *
 * Criterio alineado al migrador: opportunity.opportunity_type <> 'ACADEMIC_PRACTICE',
 * fila en study_working, postulación, legalización enlazada vía (study_working_id, postulant_ml)
 * = (opportunity_id, postulant_id) en opportunity_application.
 *
 * Uso:
 *   node src/seeders/pickMtmOpportunityIdsForMigration.js
 *   node src/seeders/pickMtmOpportunityIdsForMigration.js --limit=10 --json
 *   PICK_MTM_REQUIRE_DOCS=0 PICK_MTM_REQUIRE_PLAN=0 node src/seeders/pickMtmOpportunityIdsForMigration.js
 *
 * Variables de entorno (opcionales):
 *   PICK_MTM_LIMIT — default 10
 *   PICK_MTM_REQUIRE_DOCS — default 1 (exige ≥1 document_monitoring)
 *   PICK_MTM_REQUIRE_PLAN — default 1 (exige ≥1 monitoring_plan)
 *   PICK_MTM_REQUIRE_SCHEDULE — default 0 (exige ≥1 monitoring_plan_schedule en esos planes)
 */
import dotenv from "dotenv";
import { connectMySQL, query, closePool } from "../config/mysql.js";

dotenv.config();

function parseArgs(argv) {
  const out = { limit: null, json: false };
  for (const a of argv) {
    if (a === "--json") out.json = true;
    else if (a.startsWith("--limit=")) out.limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 10);
  }
  return out;
}

function buildSql({ limit, requireDocs, requirePlan, requireSchedule }) {
  const docClause = requireDocs
    ? `AND EXISTS (
    SELECT 1 FROM document_monitoring dm
    INNER JOIN monitoring_legalized ml ON ml.monitoring_legalized_id = dm.monitoring_legalized_id
    WHERE ml.study_working_id = o.id
  )`
    : "";
  const planClause = requirePlan
    ? `AND EXISTS (
    SELECT 1 FROM monitoring_plan mp
    INNER JOIN monitoring_legalized ml ON ml.monitoring_legalized_id = mp.monitoring_legalized_id
    WHERE ml.study_working_id = o.id
  )`
    : "";
  const scheduleClause = requireSchedule
    ? `AND EXISTS (
    SELECT 1 FROM monitoring_plan_schedule mps
    INNER JOIN monitoring_plan mp ON mp.id = mps.monitoring_plan_id
    INNER JOIN monitoring_legalized ml ON ml.monitoring_legalized_id = mp.monitoring_legalized_id
    WHERE ml.study_working_id = o.id
  )`
    : "";

  return `
SELECT
  o.id AS opportunity_id,
  o.job_title,
  o.opportunity_type,
  (SELECT COUNT(*) FROM opportunity_application oa WHERE oa.opportunity_id = o.id) AS postulaciones,
  (SELECT COUNT(*) FROM monitoring_legalized ml WHERE ml.study_working_id = o.id) AS legalizaciones,
  (SELECT COUNT(*) FROM monitoring_legalized ml
    INNER JOIN opportunity_application oa
      ON oa.opportunity_id = ml.study_working_id AND oa.postulant_id = ml.postulant_ml
    WHERE ml.study_working_id = o.id) AS legalizaciones_con_postulacion
FROM opportunity o
INNER JOIN study_working sw ON sw.study_working_id = o.id
WHERE o.opportunity_type <> 'ACADEMIC_PRACTICE'
  AND EXISTS (
    SELECT 1 FROM opportunity_application oa WHERE oa.opportunity_id = o.id
  )
  AND EXISTS (
    SELECT 1 FROM monitoring_legalized ml
    INNER JOIN opportunity_application oa
      ON oa.opportunity_id = ml.study_working_id AND oa.postulant_id = ml.postulant_ml
    WHERE ml.study_working_id = o.id
  )
  ${docClause}
  ${planClause}
  ${scheduleClause}
ORDER BY o.id DESC
LIMIT ${Number(limit)}
`.trim();
}

function printPickPreflight({ limit, requireDocs, requirePlan, requireSchedule }) {
  const mysqlHost = process.env.MYSQL_HOST || "127.0.0.1";
  const mysqlPort = process.env.MYSQL_PORT || "3306";
  const mysqlDb = process.env.MYSQL_DATABASE || "tenant-1";
  console.log(`
======================================================================
  RESUMEN PREVIO — pickMtmOpportunityIdsForMigration.js
======================================================================
  • Conectará a MySQL ${mysqlHost}:${mysqlPort}, base "${mysqlDb}".
  • Buscará hasta ${limit} filas en opportunity con:
      - opportunity_type <> 'ACADEMIC_PRACTICE'
      - study_working asociado
      - al menos una postulación y una legalización enlazada (postulant + opp)
      ${requireDocs ? "- al menos un document_monitoring" : "- (sin exigir document_monitoring)"}
      ${requirePlan ? "- al menos un monitoring_plan" : "- (sin exigir monitoring_plan)"}
      ${requireSchedule ? "- al menos una fila en monitoring_plan_schedule" : ""}
  • No escribe en MongoDB: solo lista ids y sugiere MIGRATION_FOCUS_MTM_OPP_IDS.
======================================================================
`.trim());
  console.log("");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ?? Math.max(1, parseInt(process.env.PICK_MTM_LIMIT || "10", 10) || 10);
  const requireDocs = process.env.PICK_MTM_REQUIRE_DOCS !== "0";
  const requirePlan = process.env.PICK_MTM_REQUIRE_PLAN !== "0";
  const requireSchedule = process.env.PICK_MTM_REQUIRE_SCHEDULE === "1";

  printPickPreflight({ limit, requireDocs, requirePlan, requireSchedule });

  const sql = buildSql({ limit, requireDocs, requirePlan, requireSchedule });

  await connectMySQL();
  const rows = await query(sql);
  await closePool();

  const ids = rows.map((r) => r.opportunity_id);

  if (args.json) {
    console.log(JSON.stringify({ count: ids.length, opportunityIds: ids, rows }, null, 2));
  } else {
    console.log(
      `MTM opportunity.id encontrados (${ids.length}), requireDocs=${requireDocs} requirePlan=${requirePlan} requireSchedule=${requireSchedule}:`
    );
    for (const r of rows) {
      console.log(
        `  id=${r.opportunity_id} type=${r.opportunity_type} posts=${r.postulaciones} legs=${r.legalizaciones} legs+app=${r.legalizaciones_con_postulacion} | ${r.job_title || ""}`
      );
    }
    if (ids.length) {
      const envLine = `MIGRATION_FOCUS_MTM_OPP_IDS=${ids.join(",")}`;
      console.log("\nCopiar para migración acotada (y opcionalmente saltar prácticas):");
      console.log(`${envLine} MIGRATION_SKIP_PRACTICE_OPPORTUNITIES_PIPELINE=1 npm run migrate:opportunities`);
    } else {
      console.log("\nNinguna fila cumple el criterio. Prueba PICK_MTM_REQUIRE_DOCS=0 PICK_MTM_REQUIRE_PLAN=0");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
