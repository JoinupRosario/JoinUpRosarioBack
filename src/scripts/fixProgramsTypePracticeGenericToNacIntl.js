/**
 * Reemplaza en `programs_type_practices` filas cuyo ítem es «Práctica» o «Pasantía»
 * genéricos (una sola etiqueta, sin nacional/internacional) por el par
 * Práctica/Pasantía nacional + internacional del catálogo L_PRACTICE_TYPE.
 *
 * Incluye ítems en L_EXPERIENCE_TYPE u otros listId que quedaron mal asociados.
 *
 * Uso:
 *   node src/scripts/fixProgramsTypePracticeGenericToNacIntl.js
 *   node src/scripts/fixProgramsTypePracticeGenericToNacIntl.js --apply
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import ProgramsTypePractice from "../modules/program/model/programsTypePractices.model.js";
import {
  normalizeListValueForMatch,
  fetchPracticeTypeCatalog,
  resolvePracticaNacionalIdFromItems,
  resolvePracticaInternacionalIdFromItems,
  resolvePasantiaNacionalIdFromItems,
  resolvePasantiaInternacionalIdFromItems,
} from "../modules/program/services/programTypePracticeRule.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const APPLY = process.argv.includes("--apply");

function normItemValue(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function strId(x) {
  return x == null ? "" : String(x);
}

/** Solo «Práctica» / «Practica» como etiqueta única (no «Práctica - Nacional», etc.). */
function isGenericPracticaItem(it) {
  if (!it?.value) return false;
  const n = normItemValue(it.value);
  const loose = normalizeListValueForMatch(it.value);
  if (loose.includes("pasant")) return false;
  if (n !== "practica") return false;
  if (loose.includes("nacional") || loose.includes("internac")) return false;
  return true;
}

/** Solo «Pasantía» / «Pasantia» como etiqueta única. */
function isGenericPasantiaItem(it) {
  if (!it?.value) return false;
  const n = normItemValue(it.value);
  const loose = normalizeListValueForMatch(it.value);
  if (n !== "pasantia") return false;
  if (loose.includes("nacional") || loose.includes("internac")) return false;
  return true;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("Falta MONGO_URI en .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");
  console.log("Modo:", APPLY ? "APLICAR CAMBIOS (--apply)" : "SOLO LECTURA (dry-run)\n");

  const { listId, items: catalogPractice } = await fetchPracticeTypeCatalog();
  console.log("Catálogo destino listId:", listId, "— ítems:", catalogPractice.length);
  catalogPractice.forEach((i) => console.log(`  ${strId(i._id)}  "${i.value}"`));
  console.log("");

  const nacP = resolvePracticaNacionalIdFromItems(catalogPractice);
  const intP = resolvePracticaInternacionalIdFromItems(catalogPractice);
  const nacS = resolvePasantiaNacionalIdFromItems(catalogPractice);
  const intS = resolvePasantiaInternacionalIdFromItems(catalogPractice);

  console.log("Destino L_PRACTICE_TYPE:");
  console.log("  Práctica — Nacional:", nacP ? strId(nacP) : "FALTA");
  console.log("  Práctica — Internacional:", intP ? strId(intP) : "FALTA");
  console.log("  Pasantía — Nacional:", nacS ? strId(nacS) : "FALTA");
  console.log("  Pasantía — Internacional:", intS ? strId(intS) : "FALTA");
  console.log("");

  if (!nacP || !intP) {
    console.error("Faltan ítems Práctica nacional/internacional en el catálogo; abortando.");
    await mongoose.disconnect();
    process.exit(1);
  }
  if (!nacS || !intS) {
    console.error("Faltan ítems Pasantía nacional/internacional en el catálogo; abortando.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const rows = await ProgramsTypePractice.find({})
    .populate({ path: "typePractice", select: "value listId isActive" })
    .lean();

  const toFixPractica = [];
  const toFixPasantia = [];
  for (const r of rows) {
    const it = r.typePractice;
    if (!it || it.isActive === false) continue;
    if (isGenericPracticaItem(it)) toFixPractica.push(r);
    else if (isGenericPasantiaItem(it)) toFixPasantia.push(r);
  }

  console.log("Filas con ítem genérico «Práctica»:", toFixPractica.length);
  console.log("Filas con ítem genérico «Pasantía»:", toFixPasantia.length);
  console.log("");

  async function ensureRows(programId, programFacultyId, itemIds) {
    const wanted = itemIds.filter(Boolean).map((x) => new mongoose.Types.ObjectId(strId(x)));
    const existing = await ProgramsTypePractice.find({
      programFaculty: programFacultyId,
      typePractice: { $in: wanted },
    })
      .select("typePractice")
      .lean();
    const have = new Set(existing.map((e) => strId(e.typePractice)));
    const missing = wanted.filter((id) => !have.has(strId(id)));
    if (missing.length === 0) return { inserted: 0 };

    if (!APPLY) {
      return { inserted: missing.length, wouldInsert: missing.map(strId) };
    }

    const docs = missing.map((typePractice) => ({
      program: programId,
      programFaculty: programFacultyId,
      typePractice,
    }));
    await ProgramsTypePractice.insertMany(docs);
    return { inserted: docs.length };
  }

  let deleted = 0;
  let inserted = 0;

  async function processList(list, pair, label) {
    const [a, b] = pair;
    for (const r of list) {
      const it = r.typePractice;
      const pfId = r.programFaculty;
      const progId = r.program;
      console.log(
        `[${label}] _id=${strId(r._id)} pf=${strId(pfId)} program=${strId(progId)} listId=${it?.listId} value="${it?.value}"`
      );

      if (APPLY) {
        await ProgramsTypePractice.deleteOne({ _id: r._id });
        deleted += 1;
      }

      const res = await ensureRows(progId, pfId, [a, b]);
      inserted += res.inserted || 0;
      if (res.wouldInsert) {
        console.log(`    → insertaría typePractice: ${res.wouldInsert.join(", ")}`);
      } else if (APPLY && res.inserted) {
        console.log(`    → insertadas ${res.inserted} fila(s)`);
      } else if (!APPLY) {
        console.log(`    → quitaría fila genérica; crearía nacional+internacional si faltan`);
      }
    }
  }

  await processList(toFixPractica, [nacP, intP], "PRÁCTICA");
  await processList(toFixPasantia, [nacS, intS], "PASANTÍA");

  console.log("\n--- Resumen ---");
  console.log("Filas genéricas a reemplazar:", toFixPractica.length + toFixPasantia.length);
  if (APPLY) {
    console.log("Filas eliminadas:", deleted);
    console.log("Filas nuevas insertadas:", inserted);
  } else {
    console.log("Ejecute: node src/scripts/fixProgramsTypePracticeGenericToNacIntl.js --apply");
  }

  await mongoose.disconnect();
  console.log("\nListo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
