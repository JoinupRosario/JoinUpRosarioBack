/** Lista valores de ítem usados en programs_type_practices */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import ProgramsTypePractice from "../modules/program/model/programsTypePractices.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const rows = await ProgramsTypePractice.find({})
    .populate({ path: "typePractice", select: "value listId isActive" })
    .lean();
  const map = new Map();
  for (const r of rows) {
    const tp = r.typePractice;
    const key = tp ? `${tp.value} | ${tp.listId}` : "SIN ÍTEM";
    map.set(key, (map.get(key) || 0) + 1);
  }
  console.log("Distinct typePractice en programs_type_practices (conteo):");
  [...map.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(n, k));
  await mongoose.disconnect();
}
main().catch(console.error);
