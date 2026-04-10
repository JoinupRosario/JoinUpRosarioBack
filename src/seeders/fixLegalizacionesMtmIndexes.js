/**
 * Elimina índice legado `postulacion_1` en legalizaciones_mtm (campo renombrado a postulacionMTM).
 * Sin esto, varios inserts con postulacion ausente chocan en dup key { postulacion: null }.
 *
 *   node src/seeders/fixLegalizacionesMtmIndexes.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";

dotenv.config();

const COLL = "legalizaciones_mtm";

async function main() {
  await connectDB();
  const coll = mongoose.connection.db.collection(COLL);
  const indexes = await coll.indexes();
  console.log(
    "Índices antes:",
    indexes.map((i) => i.name)
  );

  for (const idx of indexes) {
    const key = idx.key || {};
    if (idx.name === "postulacion_1" || Object.prototype.hasOwnProperty.call(key, "postulacion")) {
      console.log("Drop índice obsoleto:", idx.name);
      await coll.dropIndex(idx.name);
    }
  }

  await coll.createIndex({ postulacionMTM: 1 }, { unique: true, name: "postulacionMTM_1" });
  console.log("Índice único postulacionMTM_1 listo.");

  const after = await coll.indexes();
  console.log(
    "Índices después:",
    after.map((i) => i.name)
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
