/**
 * Repara oportunidadesMTM con `profesorResponsable: null` pero `nombreProfesor`
 * con texto. Busca el UserAdministrativo cuyo "nombres apellidos" coincida
 * (case-insensitive, sin acentos) con `nombreProfesor` y vincula su _id.
 *
 * IDEMPOTENTE: solo actualiza oportunidades sin profesorResponsable.
 *   - Si encuentra exactamente 1 candidato → enlaza.
 *   - Si encuentra 0 o >1 → reporta y no toca el documento.
 *
 * Uso:
 *   node src/scripts/repararProfesorResponsableMTM.js          (modo informe)
 *   node src/scripts/repararProfesorResponsableMTM.js --apply  (aplica cambios)
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import OportunidadMTM from "../modules/oportunidadesMTM/oportunidadMTM.model.js";
import UserAdministrativo from "../modules/usersAdministrativos/userAdministrativo.model.js";

const APPLY = process.argv.includes("--apply");

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

async function run() {
  await connectDB();
  console.log(APPLY ? "🛠  MODO APLICAR" : "🔍 MODO INFORME (usa --apply para aplicar)");

  const oportunidades = await OportunidadMTM.find({
    profesorResponsable: null,
    nombreProfesor: { $exists: true, $ne: null, $ne: "" },
  })
    .select("_id nombreCargo nombreProfesor profesorResponsable")
    .lean();

  console.log(`\nOportunidades candidatas: ${oportunidades.length}\n`);

  const admins = await UserAdministrativo.find({})
    .select("_id nombres apellidos")
    .lean();

  const idx = new Map();
  for (const a of admins) {
    const key = norm(`${a.nombres} ${a.apellidos}`);
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(a);
  }

  let resueltas = 0;
  let ambiguas = 0;
  let sinMatch = 0;

  for (const opp of oportunidades) {
    const key = norm(opp.nombreProfesor);
    const matches = idx.get(key) || [];

    if (matches.length === 1) {
      const m = matches[0];
      console.log(
        `✓ ${opp._id} "${opp.nombreCargo}" → "${opp.nombreProfesor}" = ${m._id} (${m.nombres} ${m.apellidos})`
      );
      resueltas++;
      if (APPLY) {
        await OportunidadMTM.updateOne(
          { _id: opp._id },
          { $set: { profesorResponsable: m._id } }
        );
      }
    } else if (matches.length > 1) {
      console.log(
        `⚠ ${opp._id} "${opp.nombreCargo}" → "${opp.nombreProfesor}" tiene ${matches.length} coincidencias:`
      );
      matches.forEach((m) =>
        console.log(`     · ${m._id} (${m.nombres} ${m.apellidos})`)
      );
      ambiguas++;
    } else {
      console.log(
        `✗ ${opp._id} "${opp.nombreCargo}" → "${opp.nombreProfesor}" sin coincidencia en UserAdministrativo`
      );
      sinMatch++;
    }
  }

  console.log("\n────────── RESUMEN ──────────");
  console.log(`Resueltas        : ${resueltas}${APPLY ? " (aplicadas)" : ""}`);
  console.log(`Ambiguas         : ${ambiguas}`);
  console.log(`Sin coincidencia : ${sinMatch}`);
  console.log(`Total revisadas  : ${oportunidades.length}`);
  if (!APPLY && resueltas > 0) {
    console.log("\nVuelve a correr con --apply para guardar los cambios.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
