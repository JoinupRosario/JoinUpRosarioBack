import Program from "../model/program.model.js";
import ProgramFaculty from "../model/programFaculty.model.js";
import ProgramsTypePractice from "../model/programsTypePractices.model.js";
import Item from "../../shared/reference-data/models/item.schema.js";
import { buildSearchRegex } from "../../../utils/searchUtils.js";

/**
 * Reglas programa / tipo práctica (UEJOBS): solo documentos en la colección `items` con este `listId`.
 * Por defecto `L_PRACTICE_TYPE`. Override opcional: env `PRACTICE_TYPE_LIST_ID` (no se usa DOC_PRACT_DEF_* aquí).
 */
const _rawPracticeTypeListId = process.env.PRACTICE_TYPE_LIST_ID || "L_PRACTICE_TYPE";

export const PRACTICE_TYPE_LIST_ID = String(_rawPracticeTypeListId).trim();

function normItemValue(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Normaliza el `value` del ítem en Mongo para igualar variantes del Excel/catálogo:
 * «Práctica - Internacional», «Práctica-Internacional», «Práctica – Nacional», etc.
 */
export function normalizeListValueForMatch(s) {
  if (!s || typeof s !== "string") return "";
  let v = normItemValue(s);
  v = v.replace(/\s+/g, " ").trim();
  v = v.replace(/\s*[-–—]\s*/g, " - ");
  return v;
}

/**
 * Ítems activos en `items` filtrados solo por `listId` (p. ej. L_PRACTICE_TYPE).
 */
export async function fetchPracticeTypeCatalog() {
  const listId = PRACTICE_TYPE_LIST_ID;
  const items = await Item.find({ isActive: true, listId })
    .select("_id value description sort listId")
    .sort({ sort: 1, value: 1 })
    .lean();
  return { listId, items };
}

/**
 * Heurística Práctica / Pasantía sobre una lista ya filtrada por `listId` (seeders / compat).
 */
export function resolvePracticaPasantiaIdsFromItems(items) {
  const byNorm = new Map(items.map((i) => [normItemValue(i.value), i._id]));

  let practicaId = byNorm.get("practica") || null;
  if (!practicaId) {
    const hit = items.find((i) => {
      const v = normItemValue(i.value);
      const loose = normalizeListValueForMatch(i.value);
      if (v.includes("pasant")) return false;
      if (v === "practica profesional") return true;
      if (!v.includes("practica")) return false;
      // No usar «Práctica - Nacional/Internacional» como ítem genérico
      if (loose.includes("nacional") || loose.includes("internac")) return false;
      return true;
    });
    practicaId = hit?._id ?? null;
  }

  let pasantiaId = byNorm.get("pasantia") || null;
  if (!pasantiaId) {
    const hit = items.find((i) => normItemValue(i.value).includes("pasant"));
    pasantiaId = hit?._id ?? null;
  }

  return { practicaId, pasantiaId };
}

/** Ítem «Práctica - Nacional» / «Práctica nacional» en `items` con listId L_PRACTICE_TYPE. */
export function resolvePracticaNacionalIdFromItems(items) {
  if (!items?.length) return null;
  const exactKeys = ["practica - nacional", "practica nacional"];
  for (const key of exactKeys) {
    const hit = items.find((i) => normalizeListValueForMatch(i.value) === key);
    if (hit?._id) return hit._id;
  }
  const byPhrase = items.find((i) => {
    const loose = normalizeListValueForMatch(i.value);
    if (!loose.includes("practica") || loose.includes("pasant")) return false;
    if (loose.includes("internac")) return false;
    return loose.includes("nacional");
  });
  return byPhrase?._id ?? null;
}

/** Ítem «Práctica - Internacional» / «Práctica internacional» en el mismo listId. */
export function resolvePracticaInternacionalIdFromItems(items) {
  if (!items?.length) return null;
  const exactKeys = ["practica - internacional", "practica internacional"];
  for (const key of exactKeys) {
    const hit = items.find((i) => normalizeListValueForMatch(i.value) === key);
    if (hit?._id) return hit._id;
  }
  const byPhrase = items.find((i) => {
    const loose = normalizeListValueForMatch(i.value);
    return loose.includes("practica") && !loose.includes("pasant") && loose.includes("internac");
  });
  return byPhrase?._id ?? null;
}

/**
 * Excel «Práctica»: en `items` (L_PRACTICE_TYPE) tomar id de «Práctica - Nacional» y «Práctica - Internacional»
 * (o sin guion); el programa queda con varios tipos. Si no existen ambos, se usa solo el que haya + genérico.
 */
export function resolvePracticaCargueItemIdsFromItems(items) {
  const { practicaId } = resolvePracticaPasantiaIdsFromItems(items);
  const nac = resolvePracticaNacionalIdFromItems(items);
  const intl = resolvePracticaInternacionalIdFromItems(items);
  const out = [];
  if (nac) out.push(nac);
  if (intl) out.push(intl);
  if (out.length === 0 && practicaId) out.push(practicaId);
  const seen = new Set();
  return out.filter((id) => {
    const s = String(id);
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

/** «Pasantía - Nacional» / «Pasantía nacional» en L_PRACTICE_TYPE. */
export function resolvePasantiaNacionalIdFromItems(items) {
  if (!items?.length) return null;
  const exactKeys = ["pasantia - nacional", "pasantia nacional"];
  for (const key of exactKeys) {
    const hit = items.find((i) => normalizeListValueForMatch(i.value) === key);
    if (hit?._id) return hit._id;
  }
  const byPhrase = items.find((i) => {
    const loose = normalizeListValueForMatch(i.value);
    if (!loose.includes("pasant")) return false;
    if (loose.includes("internac")) return false;
    return loose.includes("nacional");
  });
  return byPhrase?._id ?? null;
}

/** «Pasantía - Internacional» / «Pasantía internacional». */
export function resolvePasantiaInternacionalIdFromItems(items) {
  if (!items?.length) return null;
  const exactKeys = ["pasantia - internacional", "pasantia internacional"];
  for (const key of exactKeys) {
    const hit = items.find((i) => normalizeListValueForMatch(i.value) === key);
    if (hit?._id) return hit._id;
  }
  const byPhrase = items.find((i) => {
    const loose = normalizeListValueForMatch(i.value);
    return loose.includes("pasant") && loose.includes("internac");
  });
  return byPhrase?._id ?? null;
}

/**
 * Ítem «Pasantía» genérico: sin nacional/internacional en el texto (evita tomar nacional como único genérico).
 */
export function resolvePasantiaGenericaIdFromItems(items) {
  if (!items?.length) return null;
  const byNorm = new Map(items.map((i) => [normItemValue(i.value), i._id]));
  const exact = byNorm.get("pasantia") || byNorm.get("pasantía");
  if (exact) return exact;
  const hit = items.find((i) => {
    const loose = normalizeListValueForMatch(i.value);
    if (!loose.includes("pasant")) return false;
    if (loose.includes("nacional") || loose.includes("internac")) return false;
    return true;
  });
  return hit?._id ?? null;
}

/**
 * XLSX / JSON con PASANTIA: pasantía nacional + internacional del catálogo si existen; si no, genérico o primer ítem pasantía (compat).
 */
export function resolvePasantiaCargueItemIdsFromItems(items) {
  const nac = resolvePasantiaNacionalIdFromItems(items);
  const intl = resolvePasantiaInternacionalIdFromItems(items);
  const generic = resolvePasantiaGenericaIdFromItems(items);
  const out = [];
  if (nac) out.push(nac);
  if (intl) out.push(intl);
  if (out.length === 0 && generic) out.push(generic);
  if (out.length === 0) {
    const { pasantiaId } = resolvePracticaPasantiaIdsFromItems(items);
    if (pasantiaId) out.push(pasantiaId);
  }
  const seen = new Set();
  return out.filter((id) => {
    const s = String(id);
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

/**
 * Resuelve ObjectId de ítems en `items` filtrando por `listId`.
 */
export async function resolvePracticeTypeItemIds() {
  const { items, listId } = await fetchPracticeTypeCatalog();
  const { practicaId, pasantiaId } = resolvePracticaPasantiaIdsFromItems(items);
  const practicaNacionalId = resolvePracticaNacionalIdFromItems(items);
  const practicaInternacionalId = resolvePracticaInternacionalIdFromItems(items);
  const practicaCargueIds = resolvePracticaCargueItemIdsFromItems(items);
  const pasantiaNacionalId = resolvePasantiaNacionalIdFromItems(items);
  const pasantiaInternacionalId = resolvePasantiaInternacionalIdFromItems(items);
  const pasantiaCargueIds = resolvePasantiaCargueItemIdsFromItems(items);
  return {
    practicaId,
    pasantiaId,
    practicaNacionalId,
    practicaInternacionalId,
    practicaCargueIds,
    pasantiaNacionalId,
    pasantiaInternacionalId,
    pasantiaCargueIds,
    practiceTypeListId: listId,
  };
}

/**
 * Lista para UI / API: mismos ítems que usa la regla (por `listId`).
 */
export async function listPracticeTypeItemsForApi() {
  const { listId, items } = await fetchPracticeTypeCatalog();
  return {
    listId,
    data: items.map((i) => ({
      _id: i._id,
      value: i.value,
      description: i.description ?? null,
      sort: i.sort ?? null,
    })),
  };
}

function sortItemIdsByCatalog(ids, catalogItems) {
  const order = new Map(
    catalogItems.map((i, idx) => [String(i._id), { sort: i.sort ?? idx, value: i.value || "" }])
  );
  return [...ids].sort((a, b) => {
    const sa = String(a);
    const sb = String(b);
    const oa = order.get(sa)?.sort ?? 9999;
    const ob = order.get(sb)?.sort ?? 9999;
    if (oa !== ob) return Number(oa) - Number(ob);
    return String(order.get(sa)?.value).localeCompare(String(order.get(sb)?.value));
  });
}

/**
 * Etiquetas para la tabla: usa `value`/`description` del ítem aunque esté inactivo u otro listId
 * (las reglas en `programs_type_practices` pueden apuntar a ítems fuera del catálogo activo).
 */
function rowLabelsFromTypeIds(ids, itemById, sortSource) {
  if (!ids?.length) return [];
  const sorted = sortItemIdsByCatalog(ids, sortSource);
  return sorted.map((id) => {
    const sid = String(id);
    const it = itemById.get(sid);
    if (it) {
      const v = typeof it.value === "string" ? it.value.trim() : "";
      if (v) return v;
      const d = typeof it.description === "string" ? it.description.trim() : "";
      if (d) return d;
      const inactive = it.isActive === false ? " (inactivo)" : "";
      return `Ítem${inactive} · …${sid.slice(-6)}`;
    }
    return `Referencia sin ítem · …${sid.slice(-6)}`;
  });
}

/**
 * Aplica uno o varios ítems de `items` por cada `program_faculty` del programa, o vacío = no aplica (UEJOBS).
 * @param {import("mongoose").Types.ObjectId} programId
 * @param {Array<import("mongoose").Types.ObjectId|string>|null|undefined} typePracticeItemIds
 */
export async function applyTypePracticeItemsToProgram(programId, typePracticeItemIds) {
  const faculties = await ProgramFaculty.find({ programId }).select("_id").lean();
  const pfIds = faculties.map((f) => f._id);
  if (pfIds.length === 0) {
    throw new Error("El programa no tiene programas por facultad (program_faculty)");
  }

  await ProgramsTypePractice.deleteMany({ programFaculty: { $in: pfIds } });

  const raw =
    typePracticeItemIds == null
      ? []
      : Array.isArray(typePracticeItemIds)
        ? typePracticeItemIds
        : [typePracticeItemIds];
  const uniqueStr = [...new Set(raw.map((x) => String(x)).filter(Boolean))];

  if (uniqueStr.length === 0) {
    return {
      deleted: true,
      inserted: 0,
      typePracticeItemIds: [],
      typePracticeItemId: null,
    };
  }

  const configuredListId = PRACTICE_TYPE_LIST_ID;
  const found = await Item.find({ _id: { $in: uniqueStr } })
    .select("_id value sort listId isActive")
    .lean();
  const foundById = new Map(found.map((i) => [String(i._id), i]));
  const validRows = uniqueStr
    .map((id) => foundById.get(String(id)))
    .filter(
      (it) =>
        it &&
        it.isActive === true &&
        String(it.listId ?? "").trim() === String(configuredListId).trim()
    );

  // Limpieza tolerante: ignora ids que no sean activos o no pertenezcan al listId configurado.
  // Si no queda ninguno válido, se guarda como "sin regla" (equivale a NO_APLICA para este módulo).

  const ordered = sortItemIdsByCatalog(
    validRows.map((i) => i._id),
    validRows
  );

  const docs = [];
  for (const programFaculty of pfIds) {
    for (const typePractice of ordered) {
      docs.push({
        program: programId,
        programFaculty,
        typePractice,
      });
    }
  }

  if (docs.length) await ProgramsTypePractice.insertMany(docs);

  const idStrings = ordered.map((id) => String(id));
  return {
    deleted: true,
    inserted: docs.length,
    typePracticeItemIds: idStrings,
    typePracticeItemId: idStrings[0] ?? null,
  };
}

/** @deprecated Preferir applyTypePracticeItemsToProgram; mantiene compat API de un solo id. */
export async function applyTypePracticeItemToProgram(programId, typePracticeItemId) {
  return applyTypePracticeItemsToProgram(
    programId,
    typePracticeItemId == null || typePracticeItemId === "" ? null : [typePracticeItemId]
  );
}

/**
 * Compatibilidad: enum PRACTICA | PASANTIA | NO_APLICA vía ítems del mismo `listId`.
 *
 * - PRACTICA (Excel): práctica nacional + internacional en catálogo, o un ítem genérico de práctica.
 * - PASANTIA (Excel): pasantía nacional + internacional en catálogo, o genérico / compat.
 * - NO_APLICA / N.A. / N/A en Excel: no crear ítem en catálogo; es ausencia de filas (null).
 *   La UI usa «No aplica al cargue UEJOBS».
 */
export async function applyTipoPermitidoToProgram(programId, tipoPermitido) {
  const allowed = ["PRACTICA", "PASANTIA", "NO_APLICA"];
  if (!allowed.includes(tipoPermitido)) {
    throw new Error(`tipoPermitido inválido: ${tipoPermitido}`);
  }

  if (tipoPermitido === "NO_APLICA") {
    return applyTypePracticeItemsToProgram(programId, null);
  }

  const { items } = await fetchPracticeTypeCatalog();

  if (tipoPermitido === "PRACTICA") {
    const ids = resolvePracticaCargueItemIdsFromItems(items);
    if (!ids.length) {
      throw new Error(
        `No se encontró ítem de práctica en items con listId="${PRACTICE_TYPE_LIST_ID}"`
      );
    }
    return applyTypePracticeItemsToProgram(programId, ids);
  }

  const ids = resolvePasantiaCargueItemIdsFromItems(items);
  if (!ids.length) {
    throw new Error(
      `No se encontró ítem de pasantía en items con listId="${PRACTICE_TYPE_LIST_ID}"`
    );
  }

  return applyTypePracticeItemsToProgram(programId, ids);
}

/**
 * Clasificación enum por id de ítem; refuerzo con texto del ítem en catálogo (sin etiquetas quemadas).
 */
function tipoFromTypeId(typeId, itemById, ctx) {
  if (!typeId) return null;
  const a = String(typeId);
  const {
    practicaId,
    pasantiaId,
    practicaNacionalId,
    practicaInternacionalId,
    pasantiaNacionalId,
    pasantiaInternacionalId,
    pasantiaGenericaId,
  } = ctx;

  if (practicaNacionalId && a === String(practicaNacionalId)) return "PRACTICA";
  if (practicaInternacionalId && a === String(practicaInternacionalId)) return "PRACTICA";
  if (practicaId && a === String(practicaId)) return "PRACTICA";
  if (pasantiaNacionalId && a === String(pasantiaNacionalId)) return "PASANTIA";
  if (pasantiaInternacionalId && a === String(pasantiaInternacionalId)) return "PASANTIA";
  if (pasantiaGenericaId && a === String(pasantiaGenericaId)) return "PASANTIA";
  if (pasantiaId && a === String(pasantiaId)) return "PASANTIA";

  const item = itemById.get(a);
  if (item?.value) {
    const v = normItemValue(item.value);
    if (v.includes("pasant")) return "PASANTIA";
    if (v.includes("practica")) return "PRACTICA";
  }
  return "OTRO";
}

function setSignature(set) {
  return [...set].sort().join("|");
}

/**
 * Listado paginado de programas con tipos de práctica (vista reglas de negocio).
 * Etiquetas y ids salen del catálogo `items`; sin textos de negocio fijos salvo el enum `tipoPermitido`.
 */
export async function listProgramsWithTipoRule({ page = 1, limit = 15, search = "" }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  if (search && String(search).trim()) {
    const re = buildSearchRegex(search);
    filter.$or = [{ name: re }, { code: re }];
  }

  const [programs, total] = await Promise.all([
    Program.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum).select("_id name code").lean(),
    Program.countDocuments(filter),
  ]);

  if (programs.length === 0) {
    const { listId: emptyListId } = await fetchPracticeTypeCatalog();
    return {
      data: [],
      practiceTypeListId: emptyListId,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 },
    };
  }

  const { items: catalogItems, listId: catalogListId } = await fetchPracticeTypeCatalog();
  const { practicaId, pasantiaId } = resolvePracticaPasantiaIdsFromItems(catalogItems);
  const practicaNacionalId = resolvePracticaNacionalIdFromItems(catalogItems);
  const practicaInternacionalId = resolvePracticaInternacionalIdFromItems(catalogItems);
  const pasantiaNacionalId = resolvePasantiaNacionalIdFromItems(catalogItems);
  const pasantiaInternacionalId = resolvePasantiaInternacionalIdFromItems(catalogItems);
  const pasantiaGenericaId = resolvePasantiaGenericaIdFromItems(catalogItems);

  const tipoCtx = {
    practicaId,
    pasantiaId,
    practicaNacionalId,
    practicaInternacionalId,
    pasantiaNacionalId,
    pasantiaInternacionalId,
    pasantiaGenericaId,
  };

  const programIds = programs.map((p) => p._id);

  const faculties = await ProgramFaculty.find({ programId: { $in: programIds } })
    .select("_id programId code")
    .lean();

  const pfByProgram = new Map();
  const allPfIds = [];
  for (const f of faculties) {
    const pid = String(f.programId);
    if (!pfByProgram.has(pid)) pfByProgram.set(pid, []);
    pfByProgram.get(pid).push(f);
    allPfIds.push(f._id);
  }

  const ptps = await ProgramsTypePractice.find({ programFaculty: { $in: allPfIds } })
    .select("programFaculty typePractice")
    .lean();

  const allReferencedTypeIds = [
    ...new Set(ptps.map((r) => r.typePractice).filter((x) => x != null).map((id) => String(id))),
  ];

  const itemsLinkedToRules =
    allReferencedTypeIds.length > 0
      ? await Item.find({ _id: { $in: allReferencedTypeIds } })
          .select("_id value sort description listId isActive")
          .lean()
      : [];

  const itemById = new Map(catalogItems.map((i) => [String(i._id), i]));
  for (const it of itemsLinkedToRules) {
    const k = String(it._id);
    if (!itemById.has(k)) itemById.set(k, it);
  }

  const sortSource = [...catalogItems];
  const sortSeen = new Set(catalogItems.map((i) => String(i._id)));
  for (const it of itemsLinkedToRules) {
    const k = String(it._id);
    if (!sortSeen.has(k)) {
      sortSeen.add(k);
      sortSource.push(it);
    }
  }

  /** @type {Map<string, Set<string>>} */
  const tipoByPf = new Map();
  for (const row of ptps) {
    const pf = String(row.programFaculty);
    const tid = row.typePractice ? String(row.typePractice) : null;
    if (!tid) continue;
    if (!tipoByPf.has(pf)) tipoByPf.set(pf, new Set());
    tipoByPf.get(pf).add(tid);
  }

  const data = programs.map((prog) => {
    const pfs = pfByProgram.get(String(prog._id)) || [];
    const pfKeys = pfs.map((f) => String(f._id));
    const sets = pfKeys.map((k) => tipoByPf.get(k) ?? new Set());

    let tipoPermitido = "NO_APLICA";
    let typePracticeLabel = null;
    /** @type {string[]} Etiqueta por cada id (mismo orden que typePracticeItemIds); la UI puede listar varios tipos. */
    let typePracticeLabels = [];
    /** @type {string[]} */
    let typePracticeItemIds = [];
    let typePracticeItemId = null;

    if (pfs.length === 0 || sets.every((s) => s.size === 0)) {
      tipoPermitido = "NO_APLICA";
    } else {
      const sigs = sets.map((s) => setSignature(s));
      const allMatch = sigs.every((sig) => sig === sigs[0]);
      const unionSet = sets.reduce((acc, s) => {
        for (const id of s) acc.add(id);
        return acc;
      }, new Set());

      const unionSorted = sortItemIdsByCatalog([...unionSet], sortSource);

      if (!allMatch) {
        const labelParts = rowLabelsFromTypeIds(unionSorted, itemById, sortSource);
        tipoPermitido = "INCONSISTENTE";
        typePracticeItemIds = unionSorted.map(String);
        typePracticeItemId = typePracticeItemIds[0] ?? null;
        typePracticeLabels = labelParts;
        typePracticeLabel = labelParts.length ? labelParts.join(", ") : null;
      } else {
        const ids = [...sets[0]];
        const sortedIds = sortItemIdsByCatalog(ids, sortSource);
        const labelParts = rowLabelsFromTypeIds(sortedIds, itemById, sortSource);
        typePracticeItemIds = sortedIds.map(String);
        typePracticeItemId = typePracticeItemIds[0] ?? null;
        typePracticeLabels = labelParts;
        typePracticeLabel = labelParts.length ? labelParts.join(", ") : null;

        const cats = new Set(sortedIds.map((id) => tipoFromTypeId(id, itemById, tipoCtx)));
        if (cats.size > 1) {
          tipoPermitido = "INCONSISTENTE";
        } else {
          const only = [...cats][0];
          if (only === "PRACTICA") tipoPermitido = "PRACTICA";
          else if (only === "PASANTIA") tipoPermitido = "PASANTIA";
          else tipoPermitido = "OTRO";
        }
      }
    }

    return {
      programId: prog._id,
      name: prog.name,
      code: prog.code || "",
      programFacultyCount: pfs.length,
      tipoPermitido,
      typePracticeLabel,
      typePracticeLabels,
      typePracticeItemId,
      typePracticeItemIds,
      practiceTypeListId: catalogListId,
    };
  });

  return {
    data,
    practiceTypeListId: catalogListId,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
}
