/**
 * Configuración global de AWS S3.
 * Usa las variables de entorno: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET.
 * Importar y usar getS3Client() o los helpers (uploadToS3, getSignedDownloadUrl, etc.) donde se necesite S3.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION || "us-east-1";
const bucket = process.env.AWS_S3_BUCKET || "";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

/** Configuración S3 (solo lectura) */
export const s3Config = Object.freeze({
  region,
  bucket,
  isConfigured: Boolean(accessKeyId && secretAccessKey && bucket),
});

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
    s3ClientInstance = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
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
 * Genera una URL firmada para descargar un objeto (GET) con expiración en segundos.
 * Requiere: npm install @aws-sdk/s3-request-presigner
 * @param {string} key - Ruta del objeto en el bucket
 * @param {number} expiresIn - Segundos hasta que expire la URL (default 3600)
 * @returns {Promise<string>}
 */
export async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 no está configurado");
  }
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const command = new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: key,
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
  await client.send(
    new DeleteObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
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
