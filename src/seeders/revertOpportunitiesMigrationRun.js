/**
 * Revierte una corrida de migrateOpportunitiesFromMySQL.js usando el manifiesto
 * `.migration-runs/run-<runId>.json` (mismos borrados que rollbackCreatedDocuments).
 *
 * Uso:
 *   node src/seeders/revertOpportunitiesMigrationRun.js <runId>
 *   node src/seeders/revertOpportunitiesMigrationRun.js .migration-runs/run-2026-04-10T....json
 *   node src/seeders/revertOpportunitiesMigrationRun.js <runId> --dry-run
 *
 * No deshace actualizaciones en documentos que ya existían (solo borra inserts listados en el manifiesto).
 *
 * Si no existe el archivo .json (p. ej. fallo al guardar en Windows), usar:
 *   node src/seeders/revertOpportunitiesMigrationRun.js <runId> --from-db
 * Reconstruye los ObjectId desde legacy_entity_mappings donde meta.runId coincide.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import connectDB from "../config/db.js";

import Opportunity from "../modules/opportunities/opportunity.model.js";
import PostulacionOportunidad from "../modules/opportunities/postulacionOportunidad.model.js";
import LegalizacionPractica from "../modules/legalizacionPractica/legalizacionPractica.model.js";
import OportunidadMTM from "../modules/oportunidadesMTM/oportunidadMTM.model.js";
import PostulacionMTM from "../modules/oportunidadesMTM/postulacionMTM.model.js";
import LegalizacionMTM from "../modules/oportunidadesMTM/legalizacionMTM.model.js";
import PlanDeTrabajoMTM from "../modules/oportunidadesMTM/planDeTrabajoMTM.model.js";
import SeguimientoMTM from "../modules/oportunidadesMTM/seguimientoMTM.model.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RUNS_DIR = path.join(__dirname, "..", "..", ".migration-runs");

/** Alineado a LEGACY_SCOPE en migrateOpportunitiesFromMySQL.js */
const SCOPE_TO_CTX_KEY = Object.freeze({
  mtm_activity_log: "mtmSchedule",
  mtm_plan_schedule: "mtmSchedule",
  mtm_plan: "mtmPlans",
  mtm_legalization: "mtmLegalizations",
  practice_legalization: "practiceLegalizations",
  mtm_application: "mtmApplications",
  practice_application: "practiceApplications",
  mtm_opportunity: "mtmOpportunities",
  practice_opportunity: "practiceOpportunities",
});

function emptyCtxArrays() {
  return {
    mtmSchedule: [],
    mtmPlans: [],
    mtmLegalizations: [],
    practiceLegalizations: [],
    mtmApplications: [],
    practiceApplications: [],
    mtmOpportunities: [],
    practiceOpportunities: [],
  };
}

async function buildCtxFromLegacyMappings(db, runId) {
  const rows = await db.collection("legacy_entity_mappings").find({ "meta.runId": runId }).toArray();
  const ctx = emptyCtxArrays();
  for (const r of rows) {
    const key = SCOPE_TO_CTX_KEY[r.scope];
    if (!key || r.mongoId == null) continue;
    const id = r.mongoId;
    const s = String(id);
    if (!mongoose.Types.ObjectId.isValid(s)) continue;
    ctx[key].push(new mongoose.Types.ObjectId(s));
  }
  for (const k of Object.keys(ctx)) {
    const uniq = [...new Set(ctx[k].map((x) => String(x)))];
    ctx[k] = uniq.map((x) => new mongoose.Types.ObjectId(x));
  }
  return { ctx, mappingCount: rows.length };
}

function toObjectIds(arr) {
  return (arr || [])
    .filter(Boolean)
    .map((s) => {
      const str = String(s).trim();
      if (!mongoose.Types.ObjectId.isValid(str)) return null;
      return new mongoose.Types.ObjectId(str);
    })
    .filter(Boolean);
}

function printPreflight(manifestPath, manifest, dryRun, sourceLabel = "manifiesto") {
  const c = manifest.createdIds || {};
  const counts = Object.fromEntries(
    Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
  );
  console.log(`
======================================================================
  RESUMEN — revertOpportunitiesMigrationRun.js
======================================================================
  Fuente:     ${sourceLabel}
  Manifiesto: ${manifestPath || "(ninguno)"}
  runId:      ${manifest.runId}
  Modo:       ${dryRun ? "DRY-RUN (no borra nada)" : "EJECUCIÓN (borrará en MongoDB)"}

  Documentos a eliminar (por colección, según manifiesto):
    seguimientos_mtm (cronograma):     ${counts.mtmSchedule ?? 0}
    planes_trabajo_mtm:                ${counts.mtmPlans ?? 0}
    legalizaciones_mtm:                ${counts.mtmLegalizations ?? 0}
    legalizaciones_practica:           ${counts.practiceLegalizations ?? 0}
    postulaciones_mtm:                 ${counts.mtmApplications ?? 0}
    postulaciones_oportunidad:         ${counts.practiceApplications ?? 0}
    oportunidadmtms:                   ${counts.mtmOpportunities ?? 0}
    opportunities:                     ${counts.practiceOpportunities ?? 0}

  Además: legacy_entity_mappings y opportunity_status_change_logs con meta.runId = esta corrida.

  Orden de borrado: hijos primero (seguimientos → … → oportunidades → mapeos / logs).
======================================================================
`.trim());
  console.log("");
}

function resolveManifestPath(arg) {
  if (!arg) return null;
  const trimmed = arg.trim();
  if (trimmed.endsWith(".json")) {
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  }
  const dir = process.env.MIGRATION_RUNS_DIR || DEFAULT_RUNS_DIR;
  const direct = path.join(dir, `run-${trimmed}.json`);
  if (fs.existsSync(direct)) return direct;
  const safe = path.join(dir, `run-${trimmed.replace(/:/g, "-")}.json`);
  return safe;
}

async function main() {
  const allArgs = process.argv.slice(2);
  const dryRun = allArgs.includes("--dry-run");
  const fromDb = allArgs.includes("--from-db");
  const argv = allArgs.filter((a) => a !== "--dry-run" && a !== "--from-db");
  const arg = argv[0];
  if (!arg) {
    console.error(
      "Uso: node src/seeders/revertOpportunitiesMigrationRun.js <runId|path.json> [--dry-run] [--from-db]"
    );
    process.exit(1);
  }

  let manifestPath = resolveManifestPath(arg);
  let manifest;
  let ctx;
  let runId;
  let sourceLabel = "manifiesto";

  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    runId = manifest.runId;
    if (!runId) {
      console.error("Manifiesto sin runId");
      process.exit(1);
    }
    const c = manifest.createdIds || {};
    ctx = {
      mtmSchedule: toObjectIds(c.mtmSchedule),
      mtmPlans: toObjectIds(c.mtmPlans),
      mtmLegalizations: toObjectIds(c.mtmLegalizations),
      practiceLegalizations: toObjectIds(c.practiceLegalizations),
      mtmApplications: toObjectIds(c.mtmApplications),
      practiceApplications: toObjectIds(c.practiceApplications),
      mtmOpportunities: toObjectIds(c.mtmOpportunities),
      practiceOpportunities: toObjectIds(c.practiceOpportunities),
    };
  } else if (fromDb || !arg.endsWith(".json")) {
    runId = arg.replace(/\.json$/i, "").trim();
    if (arg.endsWith(".json")) {
      console.error(`No existe el manifiesto: ${manifestPath}`);
      process.exit(1);
    }
    await connectDB();
    const db = mongoose.connection.db;
    const built = await buildCtxFromLegacyMappings(db, runId);
    if (built.mappingCount === 0) {
      console.error(`No hay legacy_entity_mappings con meta.runId=${runId}. ¿RunId correcto?`);
      await mongoose.disconnect();
      process.exit(1);
    }
    ctx = built.ctx;
    manifest = {
      runId,
      createdIds: {
        mtmSchedule: ctx.mtmSchedule.map(String),
        mtmPlans: ctx.mtmPlans.map(String),
        mtmLegalizations: ctx.mtmLegalizations.map(String),
        practiceLegalizations: ctx.practiceLegalizations.map(String),
        mtmApplications: ctx.mtmApplications.map(String),
        practiceApplications: ctx.practiceApplications.map(String),
        mtmOpportunities: ctx.mtmOpportunities.map(String),
        practiceOpportunities: ctx.practiceOpportunities.map(String),
      },
    };
    manifestPath = `(legacy_entity_mappings, ${built.mappingCount} filas)`;
    sourceLabel = "MongoDB legacy_entity_mappings";
    console.log(`Reconstruido desde DB: ${built.mappingCount} mapeos con meta.runId=${runId}`);
  } else {
    console.error(`No existe el manifiesto: ${manifestPath}`);
    console.error("Si guardar el archivo falló, añade --from-db y pasa el runId.");
    process.exit(1);
  }

  printPreflight(manifestPath, manifest, dryRun, sourceLabel);

  if (dryRun) {
    console.log("Dry-run terminado.");
    if (sourceLabel.includes("MongoDB")) await mongoose.disconnect();
    process.exit(0);
  }

  if (sourceLabel === "manifiesto") await connectDB();
  const db = mongoose.connection.db;

  console.log(`Eliminando documentos de la corrida ${runId}...`);
  const r1 = await SeguimientoMTM.deleteMany({ _id: { $in: ctx.mtmSchedule } });
  const r2 = await PlanDeTrabajoMTM.deleteMany({ _id: { $in: ctx.mtmPlans } });
  const r3 = await LegalizacionMTM.deleteMany({ _id: { $in: ctx.mtmLegalizations } });
  const r4 = await LegalizacionPractica.deleteMany({ _id: { $in: ctx.practiceLegalizations } });
  const r5 = await PostulacionMTM.deleteMany({ _id: { $in: ctx.mtmApplications } });
  const r6 = await PostulacionOportunidad.deleteMany({ _id: { $in: ctx.practiceApplications } });
  const r7 = await OportunidadMTM.deleteMany({ _id: { $in: ctx.mtmOpportunities } });
  const r8 = await Opportunity.deleteMany({ _id: { $in: ctx.practiceOpportunities } });
  const r9 = await db.collection("legacy_entity_mappings").deleteMany({ "meta.runId": runId });
  const r10 = await db.collection("opportunity_status_change_logs").deleteMany({ "meta.runId": runId });

  console.log("Eliminados:", {
    seguimientos_mtm: r1.deletedCount,
    planes_trabajo_mtm: r2.deletedCount,
    legalizaciones_mtm: r3.deletedCount,
    legalizaciones_practica: r4.deletedCount,
    postulaciones_mtm: r5.deletedCount,
    postulaciones_oportunidad: r6.deletedCount,
    oportunidadmtms: r7.deletedCount,
    opportunities: r8.deletedCount,
    legacy_entity_mappings: r9.deletedCount,
    opportunity_status_change_logs: r10.deletedCount,
  });
  console.log("Revert completado.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
