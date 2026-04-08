/**
 * Auditoría: por cada empresa, campos tipo documento que sean referencia a attachment (mysqlId),
 * busca el documento en `attachments` (mysqlId number o string), normaliza `filepath` y comprueba
 * con HeadObject en AWS_S3_BUCKET_DOC_VIEJO y en AWS_S3_BUCKET.
 *
 * No modifica datos. Solo lectura MongoDB + S3.
 *
 * Uso (desde la carpeta del backend):
 *   node src/scripts/auditCompanyAttachmentS3.js
 *
 * Opciones:
 *   --json              Salida JSON (una línea por hallazgo + resumen al final)
 *   --limit=N           Máximo de empresas a recorrer (default sin límite)
 *   --only-found        Solo filas donde el objeto SÍ existe en algún bucket
 *   --only-missing      Solo filas donde NO existe en ningún bucket
 *   --company-id=ID     Solo una empresa (ObjectId hex)
 *   --first-found[=N]   Recolecta hasta N documentos cuyo filepath exista en S3 (default N=5). Para al llegar a N.
 *                       Ej.: --first-found  |  --first-found=10
 *   --filepath-prefix=X Solo considera adjuntos cuya clave normalizada empiece por "X/" (ej. company → solo company/...).
 *                       Ignora otros prefijos (p. ej. postulant/...) sin llamar a S3.
 *                       Ej.: --first-found=5 --filepath-prefix=company
 *
 * Requiere en .env: MONGO_URI, y para S3: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_REGION (opcional). Buckets: AWS_S3_BUCKET_DOC_VIEJO y/o AWS_S3_BUCKET.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { normalizeS3Key } from "../config/s3.config.js";

dotenv.config();

const DOC_FIELDS = [
  "logo",
  "chamberOfCommerceCertificate",
  "rutDocument",
  "agencyAccreditationDocument",
];

function parseArgs() {
  const out = {
    json: false,
    limit: null,
    onlyFound: false,
    onlyMissing: false,
    companyId: null,
    firstFound: false,
    /** Cuántos hallazgos en S3 recolectar con --first-found (default 5). */
    firstFoundLimit: 5,
    /** p.ej. "company" → solo claves company/... (no postulant/...) */
    filepathPrefix: null,
  };
  for (const a of process.argv.slice(2)) {
    if (a === "--json") out.json = true;
    else if (a === "--only-found") out.onlyFound = true;
    else if (a === "--only-missing") out.onlyMissing = true;
    else if (a === "--first-found") {
      out.firstFound = true;
    } else if (a.startsWith("--first-found=")) {
      out.firstFound = true;
      const n = parseInt(a.slice("--first-found=".length), 10);
      if (Number.isFinite(n) && n > 0) out.firstFoundLimit = n;
    } else if (a.startsWith("--limit=")) out.limit = parseInt(a.slice("--limit=".length), 10);
    else if (a.startsWith("--company-id=")) out.companyId = a.slice("--company-id=".length).trim();
    else if (a.startsWith("--filepath-prefix="))
      out.filepathPrefix = a.slice("--filepath-prefix=".length).trim();
  }
  if (out.onlyFound && out.onlyMissing) {
    console.error("❌ No uses --only-found y --only-missing a la vez.");
    process.exit(1);
  }
  if (out.firstFound && (out.onlyFound || out.onlyMissing)) {
    console.error("❌ Con --first-found no uses --only-found ni --only-missing.");
    process.exit(1);
  }
  return out;
}

/**
 * @param {string} normalizedKey - resultado de normalizeS3Key(filepath)
 * @param {string|null|undefined} prefixArg - ej. "company" desde --filepath-prefix=company
 */
function keyMatchesFilepathPrefix(normalizedKey, prefixArg) {
  if (prefixArg == null || String(prefixArg).trim() === "") return true;
  let p = String(prefixArg).trim().replace(/\\/g, "/");
  p = p.replace(/\/+/g, "/");
  if (p.startsWith("/")) p = p.slice(1);
  p = p.replace(/\/$/, "");
  if (!p) return true;
  return normalizedKey.startsWith(`${p}/`) || normalizedKey === p;
}

function parseAttachmentMysqlIdRef(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.trunc(v);
    return n >= 0 ? n : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

function createS3Client() {
  const id = process.env.AWS_ACCESS_KEY_ID;
  const sec = process.env.AWS_SECRET_ACCESS_KEY;
  if (!id || !sec) return null;
  return new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: { accessKeyId: id, secretAccessKey: sec },
  });
}

async function headExists(client, bucket, key) {
  if (!client || !bucket || !key) return false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    const st = e?.$metadata?.httpStatusCode;
    if (st === 404) return false;
    const code = e?.name || e?.Code || "";
    if (code === "NotFound" || code === "NoSuchKey") return false;
    throw e;
  }
}

async function main() {
  const args = parseArgs();
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ Falta MONGO_URI en .env");
    process.exit(1);
  }

  const legacyBucket = (process.env.AWS_S3_BUCKET_DOC_VIEJO || "").trim();
  const primaryBucket = (process.env.AWS_S3_BUCKET || "").trim();
  const s3 = createS3Client();

  if (args.firstFound && (!s3 || (!legacyBucket && !primaryBucket))) {
    console.error(
      "❌ --first-found requiere AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY y al menos un bucket (AWS_S3_BUCKET_DOC_VIEJO y/o AWS_S3_BUCKET)."
    );
    process.exit(1);
  }

  if (!args.json) {
    console.log("══════════════════════════════════════════════════════════════");
    console.log(
      args.firstFound
        ? ` Modo rápido: hasta ${args.firstFoundLimit} filepath(s) en S3 → parar`
        : " Auditoría: company → attachment (mysqlId) → filepath → S3 HeadObject"
    );
    console.log("══════════════════════════════════════════════════════════════");
    console.log(` Mongo: ${uri.replace(/:[^:@]+@/, ":****@")}`);
    console.log(` S3 client: ${s3 ? "OK" : "NO (faltan AWS_ACCESS_KEY_ID / AWS_SECRET)"}`);
    console.log(` Bucket legacy (company/...): ${legacyBucket || "(no definido)"}`);
    console.log(` Bucket principal:            ${primaryBucket || "(no definido)"}`);
    if (args.limit) console.log(` Límite empresas: ${args.limit}`);
    if (args.companyId) console.log(` Solo empresa _id: ${args.companyId}`);
    if (args.filepathPrefix) {
      console.log(` Solo filepath (clave) que empiece por: ${args.filepathPrefix}/`);
    }
    console.log("");
  }

  await mongoose.connect(uri, { connectTimeoutMS: 60000 });
  const companiesColl = mongoose.connection.db.collection("companies");
  const attachmentsColl = mongoose.connection.db.collection("attachments");

  let filter = {};
  if (args.companyId) {
    if (!mongoose.Types.ObjectId.isValid(args.companyId)) {
      console.error("❌ --company-id no es un ObjectId válido.");
      await mongoose.disconnect();
      process.exit(1);
    }
    filter = { _id: new mongoose.Types.ObjectId(args.companyId) };
  }
  const companyProjection = {
    name: 1,
    legalName: 1,
    commercialName: 1,
    ...Object.fromEntries(DOC_FIELDS.map((f) => [f, 1])),
  };
  let cursor = companiesColl.find(filter).project(companyProjection);
  if (args.limit && Number.isFinite(args.limit) && args.limit > 0) {
    cursor = cursor.limit(args.limit);
  }

  const rows = [];
  let companiesSeen = 0;
  /** @type {Record<string, unknown>[]} */
  const foundHits = [];

  outer: for await (const company of cursor) {
    companiesSeen += 1;
    const companyId = String(company._id);
    const companyName = company.name || company.legalName || company.commercialName || "(sin nombre)";

    for (const field of DOC_FIELDS) {
      const raw = company[field];
      const mysqlId = parseAttachmentMysqlIdRef(raw);
      if (mysqlId == null) continue;

      const att = await attachmentsColl.findOne({
        $or: [{ mysqlId: mysqlId }, { mysqlId: String(mysqlId) }],
      });

      if (!att) {
        if (!args.firstFound) {
          rows.push({
            companyId,
            companyName,
            field,
            rawValue: raw,
            mysqlId,
            attachmentFound: false,
            filepath: null,
            keyNormalized: null,
            inLegacy: false,
            inPrimary: false,
            resolvedBucket: null,
            s3Skipped: false,
            error: "Sin fila en attachments para ese mysqlId",
          });
        }
        continue;
      }

      const filepath = att.filepath != null ? String(att.filepath).trim() : "";
      const key = normalizeS3Key(filepath);
      if (!keyMatchesFilepathPrefix(key, args.filepathPrefix)) {
        continue;
      }

      let inLegacy = false;
      let inPrimary = false;
      let s3Error = null;
      let s3Skipped = false;

      if (!s3 || !key) {
        s3Skipped = !s3;
      } else if (s3 && key) {
        try {
          if (legacyBucket) inLegacy = await headExists(s3, legacyBucket, key);
          if (primaryBucket) inPrimary = await headExists(s3, primaryBucket, key);
        } catch (e) {
          s3Error = e?.message || String(e);
        }
      }

      let resolvedBucket = null;
      if (inLegacy) resolvedBucket = legacyBucket;
      else if (inPrimary) resolvedBucket = primaryBucket;

      const row = {
        companyId,
        companyName,
        field,
        rawValue: raw,
        mysqlId,
        attachmentFound: true,
        attachmentName: att.name != null ? String(att.name) : "",
        filepath,
        keyNormalized: key,
        inLegacy,
        inPrimary,
        resolvedBucket,
        s3Error,
        s3Skipped,
      };

      if (args.firstFound && (inLegacy || inPrimary)) {
        foundHits.push(row);
        if (foundHits.length >= args.firstFoundLimit) {
          break outer;
        }
        continue;
      }
      if (!args.firstFound) {
        rows.push(row);
      }
    }
  }

  await mongoose.disconnect();

  if (args.firstFound) {
    if (args.json) {
      console.log(
        JSON.stringify(
          foundHits.length > 0
            ? {
                ok: true,
                hits: foundHits,
                count: foundHits.length,
                asked: args.firstFoundLimit,
                filepathPrefix: args.filepathPrefix || null,
              }
            : {
                ok: false,
                filepathPrefix: args.filepathPrefix || null,
                message:
                  "Ningún filepath encontrado en S3 con el filtro indicado (revisadas referencias mysqlId hasta el final del cursor).",
              },
          null,
          2
        )
      );
      process.exit(foundHits.length > 0 ? 0 : 1);
    }
    if (foundHits.length > 0) {
      console.log(
        `✅ Archivos encontrados en S3: ${foundHits.length}/${args.firstFoundLimit} pedidos` +
          (args.filepathPrefix ? ` (solo prefijo ${args.filepathPrefix}/)` : "") +
          " — usá estos datos para verificar:\n"
      );
      foundHits.forEach((hit, i) => {
        console.log(`────────── #${i + 1} ──────────`);
        console.log(`  Empresa _id:     ${hit.companyId}`);
        console.log(`  Nombre empresa:  ${hit.companyName}`);
        console.log(`  Campo:           ${hit.field}`);
        console.log(`  mysqlId:         ${hit.mysqlId}`);
        console.log(`  attachment.name: ${hit.attachmentName}`);
        console.log(`  filepath (BD):   ${hit.filepath}`);
        console.log(`  key normalizada: ${hit.keyNormalized}`);
        console.log(
          `  Bucket:          ${hit.inLegacy ? `LEGACY → ${legacyBucket}` : `PRINCIPAL → ${primaryBucket}`}`
        );
        console.log("");
      });
      console.log(`Empresas recorridas en el recorrido: ${companiesSeen}`);
      console.log(
        "Listo. Comprobá en la consola de S3 o con la vista previa de la app usando estas empresas."
      );
    } else {
      console.log(
        "❌ No se encontró ningún documento cuyo filepath exista en los buckets configurados" +
          (args.filepathPrefix ? ` (filtrando prefijo ${args.filepathPrefix}/)` : "") +
          "."
      );
      console.log(
        "   Revisaste " +
          companiesSeen +
          " empresa(s). Si hay muchas sin adjunto, probá --limit=500 o revisá credenciales/buckets."
      );
      process.exit(1);
    }
    process.exit(0);
  }

  const summary = {
    companiesScanned: companiesSeen,
    rowsTotal: rows.length,
    attachmentMissingInMongo: rows.filter((r) => !r.attachmentFound).length,
    s3FoundAnywhere: rows.filter((r) => r.inLegacy || r.inPrimary).length,
    s3MissingEverywhere: rows.filter(
      (r) =>
        r.attachmentFound &&
        r.keyNormalized &&
        !r.inLegacy &&
        !r.inPrimary &&
        !r.s3Error &&
        !r.s3Skipped
    ).length,
    s3SkippedRows: rows.filter((r) => r.s3Skipped).length,
    s3Errors: rows.filter((r) => r.s3Error).length,
  };

  let filtered = rows;
  if (args.onlyFound) {
    filtered = rows.filter((r) => r.inLegacy || r.inPrimary);
  } else if (args.onlyMissing) {
    filtered = rows.filter(
      (r) =>
        r.attachmentFound &&
        r.keyNormalized &&
        !r.inLegacy &&
        !r.inPrimary &&
        !r.s3Error &&
        !r.s3Skipped
    );
  }

  if (args.json) {
    console.log(JSON.stringify({ summary, rows: filtered }, null, 2));
    process.exit(0);
  }

  for (const r of filtered) {
    const loc = r.inLegacy
      ? `LEGACY (${legacyBucket})`
      : r.inPrimary
        ? `PRINCIPAL (${primaryBucket})`
        : r.s3Error
          ? `ERROR S3: ${r.s3Error}`
          : r.s3Skipped
            ? "S3 no probado (sin credenciales o sin key)"
            : r.attachmentFound && r.keyNormalized
              ? "NO EN NINGÚN BUCKET"
              : r.error || "sin filepath";
    const attInfo = r.attachmentFound
      ? `name="${r.attachmentName || ""}" key=${r.keyNormalized}`
      : r.error || "—";
    console.log(
      `[${r.field}] ${r.companyName} | mysqlId=${r.mysqlId} | ${attInfo} | ${loc}`
    );
  }

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("Resumen:");
  console.log(`  Empresas recorridas:     ${summary.companiesScanned}`);
  console.log(`  Referencias mysqlId:   ${summary.rowsTotal}`);
  console.log(`  Sin fila en attachments: ${summary.attachmentMissingInMongo}`);
  console.log(`  Objeto S3 encontrado:    ${summary.s3FoundAnywhere}`);
  console.log(`  Objeto S3 en ningún bucket: ${summary.s3MissingEverywhere}`);
  console.log(`  Errores S3 (permisos/red): ${summary.s3Errors}`);
  console.log(`  Filas sin probar S3:       ${summary.s3SkippedRows}`);
  console.log("──────────────────────────────────────────────────────────────");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  console.error(err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
