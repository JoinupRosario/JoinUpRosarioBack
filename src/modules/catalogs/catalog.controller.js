import Item from "../shared/reference-data/models/item.schema.js";

/**
 * Alias semánticos → listId en colección `items`.
 * Configurar vía env cuando el listId exacto se obtenga de `Criterios.docx` / dynamic_list.
 * También se puede llamar GET /catalogs/L_XXX con el listId literal.
 */
/** Mismo default que alias `category` / `mtm_categoria` (categoría MTM en `items`). */
const MTM_CATEGORY_LIST_ID = process.env.CATALOG_LIST_MTM_CATEGORY || "L_MONITORING_TYPE";

const DEFAULT_ALIASES = Object.freeze({
  category: MTM_CATEGORY_LIST_ID,
  status: process.env.CATALOG_LIST_GENERIC_STATUS || "",
  /** Ítems de tipo monitoría; mismo listId que `OportunidadMTM.categoria` (L_MONITORING_TYPE). */
  mtm_categoria: MTM_CATEGORY_LIST_ID,
  dedication_hours: process.env.CATALOG_LIST_MTM_DEDICATION_HOURS || "",
  tipo_vinculacion_mtm: process.env.CATALOG_LIST_MTM_LINK_TYPE || "",
  tracing_status: process.env.CATALOG_LIST_MTM_TRACING_STATUS || "",
  practice_job_area: process.env.CATALOG_LIST_PRACTICE_JOB_AREA || "",
});

function resolveListId(typeParam) {
  const raw = String(typeParam || "").trim();
  if (!raw) return null;
  if (raw.startsWith("L_")) return raw;
  return DEFAULT_ALIASES[raw] || null;
}

/**
 * GET /catalogs/:type
 * Devuelve ítems activos ordenados para poblar selects (sin hardcode en frontend).
 */
export async function getCatalogByType(req, res) {
  try {
    const listId = resolveListId(req.params.type);
    if (!listId) {
      return res.status(404).json({
        type: req.params.type,
        data: [],
        meta: { requiresConfiguration: true },
      });
    }

    const items = await Item.find({ listId, isActive: true })
      .sort({ sort: 1, value: 1 })
      .limit(500)
      .select("_id value description listId status")
      .lean();

    /** Categoría MTM: etiqueta = `value` del ítem (no `description`). */
    const useValueAsLabel =
      listId === MTM_CATEGORY_LIST_ID || String(listId).toUpperCase() === "L_MONITORING_TYPE";
    const labelFromItem = (i) =>
      useValueAsLabel
        ? String(i.value ?? "").trim() || String(i._id)
        : i.description?.trim() || i.value;

    res.json({
      data: items.map((i) => ({
        value: String(i._id),
        label: labelFromItem(i),
        extra: { value: i.value, description: i.description, listId: i.listId },
      })),
      meta: { listId, count: items.length },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
