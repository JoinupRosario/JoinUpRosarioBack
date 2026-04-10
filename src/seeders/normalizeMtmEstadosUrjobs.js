/**
 * Normaliza estados MTM alineados a UrJobs (sin «Borrador» / borrador en oferta y legalización).
 *
 * - OportunidadMTM: Borrador → Creada (+ historialEstados)
 * - LegalizacionMTM: borrador → creada (+ historial)
 *
 * Uso: npm run seed:normalize-mtm-estados-urjobs
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import OportunidadMTM from "../modules/oportunidadesMTM/oportunidadMTM.model.js";
import LegalizacionMTM from "../modules/oportunidadesMTM/legalizacionMTM.model.js";

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("Falta MONGO_URI en .env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const legRes = await LegalizacionMTM.updateMany({ estado: "borrador" }, { $set: { estado: "creada" } });
  console.log(`LegalizacionMTM estado borrador→creada: matched=${legRes.matchedCount} modified=${legRes.modifiedCount}`);

  const oppRes = await OportunidadMTM.updateMany({ estado: "Borrador" }, { $set: { estado: "Creada" } });
  console.log(`OportunidadMTM Borrador→Creada: matched=${oppRes.matchedCount} modified=${oppRes.modifiedCount}`);

  const legHist = await LegalizacionMTM.find({
    historial: { $elemMatch: { $or: [{ estadoNuevo: "borrador" }, { estadoAnterior: "borrador" }] } },
  }).select("_id historial");
  let legHistSaved = 0;
  for (const doc of legHist) {
    let dirty = false;
    for (const h of doc.historial || []) {
      if (h.estadoNuevo === "borrador") {
        h.estadoNuevo = "creada";
        dirty = true;
      }
      if (h.estadoAnterior === "borrador") {
        h.estadoAnterior = "creada";
        dirty = true;
      }
    }
    if (dirty) {
      doc.markModified("historial");
      await doc.save();
      legHistSaved++;
    }
  }
  console.log(`LegalizacionMTM historial borrador→creada: documentos actualizados=${legHistSaved}`);

  const opHist = await OportunidadMTM.find({
    historialEstados: { $elemMatch: { $or: [{ estadoNuevo: "Borrador" }, { estadoAnterior: "Borrador" }] } },
  }).select("_id historialEstados");
  let opHistSaved = 0;
  for (const doc of opHist) {
    let dirty = false;
    for (const h of doc.historialEstados || []) {
      if (h.estadoNuevo === "Borrador") {
        h.estadoNuevo = "Creada";
        dirty = true;
      }
      if (h.estadoAnterior === "Borrador") {
        h.estadoAnterior = "Creada";
        dirty = true;
      }
    }
    if (dirty) {
      doc.markModified("historialEstados");
      await doc.save();
      opHistSaved++;
    }
  }
  console.log(`OportunidadMTM historial Borrador→Creada: documentos actualizados=${opHistSaved}`);

  await mongoose.disconnect();
  console.log("Listo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
