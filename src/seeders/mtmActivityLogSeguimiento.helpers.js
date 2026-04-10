/** Utilidades compartidas: monitoring_activity_log → SeguimientoMTM (migrador + seed JSON). */

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return v == null ? null : String(v).trim();
}

/** Texto visible: observación + acciones (sin metadatos de migración). */
export function comentariosFromMysqlActivityLogRow(row) {
  return [str(row.observation_activity), str(row.actions)].filter(Boolean).join("\n\n").trim();
}

/**
 * Documento de soporte desde `first_attachment` / `second_attachment`.
 * `attachmentsByMysqlId`: Map de mysqlId → doc Mongo Attachment lean { filepath, name }.
 * `sqlAttachmentByMysqlId` (opcional): Map de mysqlId → { filepath, name } desde tabla MySQL `attachment`.
 */
export function documentoSoporteFromActivityLogRow(attachmentsByMysqlId, row, sqlAttachmentByMysqlId = null) {
  const id1 = num(row.first_attachment);
  const id2 = num(row.second_attachment);
  const mongoAtt =
    (id1 && attachmentsByMysqlId.get(id1)) || (id2 && attachmentsByMysqlId.get(id2));
  const sqlAtt =
    !mongoAtt && sqlAttachmentByMysqlId
      ? (id1 && sqlAttachmentByMysqlId.get(id1)) || (id2 && sqlAttachmentByMysqlId.get(id2))
      : null;
  const att = mongoAtt || sqlAtt;
  const key = att?.filepath != null ? str(att.filepath) : "";
  if (!key) return null;
  return {
    key,
    originalName: att.name != null ? str(att.name) || null : null,
    size: null,
  };
}
