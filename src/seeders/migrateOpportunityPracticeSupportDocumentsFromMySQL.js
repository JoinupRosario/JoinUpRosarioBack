/**
 * Empalma documentos de apoyo de la oferta de práctica (legado) con lo ya migrado en Mongo.
 *
 * Origen MySQL: `academic_practice.required_document`, `required_document_2`, `required_document_3`
 * (FK → `attachment.id`).
 *
 * Destino Mongo: `opportunities.documentos[]` (mismo shape que creación en la API nueva).
 *
 * Requisitos previos:
 * - `npm run migrate:attachments` (cada attachment.id debe existir en `attachments` con `mysqlId`)
 * - Oportunidades de práctica ya migradas (`legacy_entity_mappings` scope `practice_opportunity`)
 *
 * Comportamiento:
 * - Por defecto solo actualiza ofertas con `documentos` vacío o inexistente (no pisa adjuntos cargados en la nueva plataforma).
 * - `MIGRATION_PRACTICE_SUPPORT_DOCUMENTS_FORCE=1` → sobrescribe `documentos` si en MySQL hay al menos un adjunto.
 *
 * Uso: npm run migrate:opportunity-practice-support-docs
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Opportunity from "../modules/opportunities/opportunity.model.js";
import Attachment from "../modules/shared/attachment/attachment.schema.js";

dotenv.config();

const BATCH_SIZE = Number(process.env.MIGRATION_PRACTICE_SUPPORT_DOCS_BATCH || 500);
const FORCE = process.env.MIGRATION_PRACTICE_SUPPORT_DOCUMENTS_FORCE === "1";
const DB_NAME = process.env.MYSQL_DATABASE || "tenant-1";

const runQuery = (sql, params = []) =>
  query(sql, params).catch((err) => {
    if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  });

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (Buffer.isBuffer(v)) return v[0] === 1;
  return String(v).toLowerCase() === "1" || String(v).toLowerCase() === "true";
}

function fileNameFromPath(p) {
  if (p == null || p === "") return "";
  const s = String(p).replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function attachmentToOpportunityDocumento(att, orden, requerido) {
  const nombre = (att.name && String(att.name).trim()) || `Documento de apoyo ${orden}`;
  const path = att.filepath != null ? String(att.filepath) : "";
  const fn = fileNameFromPath(path) || nombre.slice(0, 120);
  return {
    nombre: nombre.slice(0, 500),
    archivo: {
      originalName: att.name != null ? String(att.name) : nombre,
      fileName: fn,
      path,
      size: null,
      mimeType: att.contentType != null ? String(att.contentType) : "application/octet-stream",
    },
    requerido: !!requerido,
    orden,
  };
}

async function loadPracticeOpportunityMongoByMysqlId() {
  const coll = mongoose.connection.collection("legacy_entity_mappings");
  const cursor = coll.find({ scope: "practice_opportunity" }, { projection: { legacyId: 1, mongoId: 1 } });
  const map = new Map();
  for await (const doc of cursor) {
    const lid = num(doc.legacyId);
    if (lid != null && doc.mongoId) map.set(lid, doc.mongoId);
  }
  return map;
}

async function migrate() {
  console.log("🔄 Documentos de apoyo de práctica: MySQL academic_practice → Opportunity.documentos\n");
  console.log(`   MySQL DB: ${DB_NAME} | FORCE=${FORCE} | lote MySQL: ${BATCH_SIZE}\n`);

  await connectDB();
  await connectMySQL();

  const oppMongoByMysql = await loadPracticeOpportunityMongoByMysqlId();
  console.log(`   Mapeos practice_opportunity: ${oppMongoByMysql.size}\n`);

  let offset = 0;
  let updated = 0;
  let skippedNoMapping = 0;
  let skippedHasDocs = 0;
  let skippedNoMysqlRow = 0;
  let missingAttachment = 0;

  while (true) {
    const rows = await runQuery(
      `
      SELECT
        ap.academic_practice_id AS opportunity_mysql_id,
        ap.required_document AS att1,
        ap.required_document_2 AS att2,
        ap.required_document_3 AS att3,
        ap.is_doc_required AS is_doc_required
      FROM academic_practice ap
      INNER JOIN opportunity o ON o.id = ap.academic_practice_id AND o.opportunity_type = 'ACADEMIC_PRACTICE'
      WHERE (
        ap.required_document IS NOT NULL
        OR ap.required_document_2 IS NOT NULL
        OR ap.required_document_3 IS NOT NULL
      )
      ORDER BY ap.academic_practice_id
      LIMIT ? OFFSET ?
      `,
      [BATCH_SIZE, offset]
    );

    if (!rows.length) break;
    offset += rows.length;

    const attachmentMysqlIds = new Set();
    for (const r of rows) {
      for (const k of ["att1", "att2", "att3"]) {
        const id = num(r[k]);
        if (id != null) attachmentMysqlIds.add(id);
      }
    }

    const attIdList = [...attachmentMysqlIds];
    const attachments =
      attIdList.length > 0
        ? await Attachment.find({ mysqlId: { $in: attIdList } })
            .select("mysqlId name filepath contentType")
            .lean()
        : [];
    const attByMysql = new Map(attachments.map((a) => [a.mysqlId, a]));

    for (const r of rows) {
      const mysqlOppId = num(r.opportunity_mysql_id);
      if (mysqlOppId == null) continue;

      const mongoOppId = oppMongoByMysql.get(mysqlOppId);
      if (!mongoOppId) {
        skippedNoMapping++;
        continue;
      }

      const slots = [
        { mysqlAttId: num(r.att1), orden: 1, requerido: bool(r.is_doc_required) },
        { mysqlAttId: num(r.att2), orden: 2, requerido: false },
        { mysqlAttId: num(r.att3), orden: 3, requerido: false },
      ];

      const documentos = [];
      for (const { mysqlAttId, orden, requerido } of slots) {
        if (mysqlAttId == null) continue;
        const att = attByMysql.get(mysqlAttId);
        if (!att) {
          missingAttachment++;
          continue;
        }
        documentos.push(attachmentToOpportunityDocumento(att, orden, requerido));
      }

      if (!documentos.length) continue;

      const opp = await Opportunity.findById(mongoOppId).select("documentos tipo").lean();
      if (!opp || String(opp.tipo || "").toLowerCase() !== "practica") {
        skippedNoMysqlRow++;
        continue;
      }

      const hasDocs = Array.isArray(opp.documentos) && opp.documentos.length > 0;
      if (hasDocs && !FORCE) {
        skippedHasDocs++;
        continue;
      }

      await Opportunity.updateOne({ _id: mongoOppId }, { $set: { documentos } });
      updated++;
    }
  }

  console.log("────────────────────────────────────────");
  console.log(`✅ Oportunidades actualizadas (documentos):     ${updated}`);
  console.log(`   Omitidas (sin mapping legacy):              ${skippedNoMapping}`);
  console.log(`   Omitidas (ya tenían documentos, sin FORCE): ${skippedHasDocs}`);
  console.log(`   Omitidas (opp no práctica / no encontrada): ${skippedNoMysqlRow}`);
  console.log(`   ⚠️  Referencias attachment sin fila en Mongo: ${missingAttachment}`);
  console.log("────────────────────────────────────────");
}

migrate()
  .catch((e) => {
    console.error("❌ Error:", e.message);
    if (e.stack) console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
      await mongoose.disconnect();
    } catch (_) {
      /* noop */
    }
  });
