/**
 * Configuración global de AWS S3.
 * Usa las variables de entorno: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET.
 * Adjuntos migrados desde MySQL usan prefijos `company/...` o `postulant/...` y suelen vivir en AWS_S3_BUCKET_DOC_VIEJO.
 * Importar y usar getS3Client() o los helpers (uploadToS3, getSignedDownloadUrl, etc.) donde se necesite S3.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

/** Configuración S3 leída en tiempo de ejecución (tras dotenv.config()) para que las variables estén disponibles. */
function getEnvConfig() {
  return {
    region: process.env.AWS_REGION || "us-east-1",
    bucket: (process.env.AWS_S3_BUCKET || "").trim(),
    /** Bucket donde están los filepath legacy tipo company/new_company.../document/... (migración). */
    legacyBucket: (process.env.AWS_S3_BUCKET_DOC_VIEJO || "").trim(),
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

/** Claves de adjuntos antiguos (MySQL) que pueden estar en el bucket legacy o copiados al principal. */
function isLegacyAttachmentKeyPrefix(normalizedKey) {
  return (
    normalizedKey.startsWith("company/") || normalizedKey.startsWith("postulant/")
  );
}

/**
 * Elige el bucket según la clave S3.
 * - Claves `company/...` o `postulant/...` (migración) → bucket legacy si está configurado.
 * - Resto (p. ej. `companies-practicas/...`) → AWS_S3_BUCKET.
 */
export function resolveBucketForKey(key) {
  const k = String(key || "").trim();
  const { bucket, legacyBucket } = getEnvConfig();
  if (k.startsWith("company/")) {
    if (!legacyBucket) {
      throw new Error(
        "Clave S3 legacy (prefijo company/): configure AWS_S3_BUCKET_DOC_VIEJO en el servidor."
      );
    }
    return legacyBucket;
  }
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET no está configurado");
  }
  return bucket;
}

/** Normaliza claves migradas (espacios, barras invertidas, slashes duplicados). */
export function normalizeS3Key(key) {
  let k = String(key ?? "").trim();
  if (!k) return k;
  k = k.replace(/\\/g, "/");
  k = k.replace(/\/+/g, "/");
  if (k.startsWith("/")) k = k.slice(1);
  return k;
}

/** Prefijos de objetos en S3 (bucket principal o legacy), no rutas bajo uploads/ local. */
const REMOTE_ATTACHMENT_S3_PREFIXES = [
  "company/",
  "postulant/",
  "perfil-documentos-soporte/",
  "hojas-vida/",
  "companies-practicas/",
  "cvs/",
];

/**
 * Indica si `filepath` guardado en Attachment apunta a un objeto en S3 (incl. migración MySQL company/… o postulant/…).
 */
export function isRemoteAttachmentS3Key(filepath) {
  const k = normalizeS3Key(filepath);
  if (!k) return false;
  return REMOTE_ATTACHMENT_S3_PREFIXES.some((p) => k.startsWith(p));
}

async function objectExistsInBucket(client, bucket, key) {
  if (!bucket || !key) return false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    const status = e?.$metadata?.httpStatusCode;
    if (status === 404) return false;
    const name = e?.name || e?.Code || "";
    if (name === "NotFound" || name === "NoSuchKey") return false;
    return false;
  }
}

/**
 * Elige el bucket donde existe el objeto (lectura/borrado).
 * Para `company/...` y `postulant/...` prueba legacy y luego el bucket principal (migraciones parciales).
 * @returns {Promise<string|null>} null si la clave no existe en ningún bucket configurado.
 */
export async function resolveBucketForRead(key) {
  const client = getS3Client();
  if (!client) throw new Error("S3 no está configurado");
  const normalized = normalizeS3Key(key);
  const { bucket, legacyBucket } = getEnvConfig();
  if (!isLegacyAttachmentKeyPrefix(normalized)) {
    return resolveBucketForKey(normalized);
  }
  if (!legacyBucket) {
    return resolveBucketForKey(normalized);
  }
  const inLegacy = await objectExistsInBucket(client, legacyBucket, normalized);
  if (inLegacy) return legacyBucket;
  if (bucket) {
    const inPrimary = await objectExistsInBucket(client, bucket, normalized);
    if (inPrimary) return bucket;
  }
  return null;
}

/** Configuración S3 (se lee cada vez para no depender del orden de carga de dotenv). */
export const s3Config = new Proxy(
  {},
  {
    get(_, prop) {
      const c = getEnvConfig();
      if (prop === "region") return c.region;
      if (prop === "bucket") return c.bucket;
      if (prop === "legacyBucket") return c.legacyBucket;
      if (prop === "isConfigured") return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket);
      return undefined;
    },
  }
);

let s3ClientInstance = null;

/**
 * Cliente S3 singleton. Solo se crea si hay credenciales y bucket en .env.
 * @returns {S3Client|null}
 */
export function getS3Client() {
  if (!s3Config.isConfigured) {
    return null;
  }
  if (!s3ClientInstance) {
    const c = getEnvConfig();
    s3ClientInstance = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

/**
 * Sube un buffer o Uint8Array a S3.
 * @param {string} key - Ruta del objeto en el bucket (ej: "cvs/abc123.pdf")
 * @param {Buffer|Uint8Array} body - Contenido del archivo
 * @param {object} options - { contentType?: string, metadata?: Record<string, string> }
 * @returns {Promise<{ key: string, bucket: string }>}
 */
export async function uploadToS3(key, body, options = {}) {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 no está configurado: revisa AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY y AWS_S3_BUCKET en .env");
  }
  /** Las subidas nuevas siempre van al bucket principal (nunca al legacy). */
  const command = new PutObjectCommand({
    Bucket: s3Config.bucket,
    Key: key,
    Body: body,
    ContentType: options.contentType || "application/octet-stream",
    Metadata: options.metadata,
  });
  await client.send(command);
  return { key, bucket: s3Config.bucket };
}

/**
 * Obtiene el contenido de un objeto de S3 como Buffer (para enviarlo al cliente desde el backend).
 * Así la descarga va contra tu API y no hay problemas de CORS con S3.
 * @param {string} key - Ruta del objeto en el bucket
 * @returns {Promise<{ body: Buffer, contentType?: string }>}
 */
export async function getObjectFromS3(key) {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 no está configurado");
  }
  const normalized = normalizeS3Key(key);
  const bucket = await resolveBucketForRead(normalized);
  if (bucket == null) {
    throw new Error(
      "El archivo no existe en el almacenamiento (clave no encontrada en ningún bucket)."
    );
  }
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: normalized,
  });
  const response = await client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  return {
    body,
    contentType: response.ContentType,
  };
}

/**
 * Genera una URL firmada para descargar un objeto (GET) con expiración en segundos.
 * Requiere: npm install @aws-sdk/s3-request-presigner
 * @param {string} key - Ruta del objeto en el bucket
 * @param {number} expiresIn - Segundos hasta que expire la URL (default 3600)
 * @param {object} options - { responseContentDisposition?: string, responseContentType?: string }
 * @returns {Promise<string>}
 */
export async function getSignedDownloadUrl(key, expiresIn = 3600, options = {}) {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 no está configurado");
  }
  const normalized = normalizeS3Key(key);
  const bucket = await resolveBucketForRead(normalized);
  if (bucket == null) {
    throw new Error(
      "El archivo no existe en el almacenamiento (NoSuchKey). Revise la clave o el bucket de documentos legacy."
    );
  }
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: normalized,
    ...(options.responseContentDisposition
      ? { ResponseContentDisposition: options.responseContentDisposition }
      : {}),
    ...(options.responseContentType ? { ResponseContentType: options.responseContentType } : {}),
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Elimina un objeto del bucket.
 * @param {string} key - Ruta del objeto
 * @returns {Promise<void>}
 */
export async function deleteFromS3(key) {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 no está configurado");
  }
  const normalized = normalizeS3Key(key);
  const bucket = await resolveBucketForRead(normalized);
  if (bucket == null) {
    return;
  }
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: normalized,
    })
  );
}

/**
 * Lista objetos bajo un prefijo (opcional).
 * @param {string} prefix - Prefijo (ej: "cvs/")
 * @param {number} maxKeys - Máximo de claves a devolver
 * @returns {Promise<{ keys: string[] }>}
 */
export async function listS3Keys(prefix = "", maxKeys = 1000) {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 no está configurado");
  }
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: s3Config.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );
  const keys = (response.Contents || []).map((o) => o.Key).filter(Boolean);
  return { keys };
}
