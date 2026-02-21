/**
 * Script: cleanByUserCreator.js
 * Uso: node src/seeders/cleanByUserCreator.js
 *
 * Muestra cuántos documentos existen en `programs` y `program_faculties`
 * con un userCreator específico, y pide confirmación antes de borrarlos.
 */

import "dotenv/config";
import mongoose from "mongoose";
import readline from "readline";

// ── Colecciones a limpiar ────────────────────────────────────────────────────
const TARGET_EMAIL = "diegoalexander1598@gmail.com";
const COLLECTIONS = [
  { label: "programs",          collection: "programs" },
  { label: "program_faculties", collection: "program_faculties" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const ask = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });

const hr = () => console.log("─".repeat(55));

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔌 Conectando a MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado.\n");

  hr();
  console.log(`🔍 Buscando documentos con userCreator: "${TARGET_EMAIL}"\n`);

  const counts = [];

  for (const { label, collection } of COLLECTIONS) {
    const col = mongoose.connection.collection(collection);
    const count = await col.countDocuments({ userCreator: TARGET_EMAIL });
    counts.push({ label, collection, count });
    console.log(`  📂 ${label.padEnd(22)} → ${count} documento${count !== 1 ? "s" : ""}`);
  }

  hr();

  const totalToDelete = counts.reduce((sum, c) => sum + c.count, 0);

  if (totalToDelete === 0) {
    console.log("\n✅ No hay documentos con ese userCreator. Nada que borrar.\n");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`\n⚠️  Total a eliminar: ${totalToDelete} documento${totalToDelete !== 1 ? "s" : ""}`);
  console.log("   Esta acción NO se puede deshacer.\n");

  const answer = await ask('❓ ¿Confirma la eliminación? Escriba "si" para continuar: ');

  if (answer.toLowerCase() !== "si") {
    console.log("\n❌ Operación cancelada. No se eliminó nada.\n");
    await mongoose.disconnect();
    process.exit(0);
  }

  hr();
  console.log("\n🗑️  Eliminando...\n");

  for (const { label, collection, count } of counts) {
    if (count === 0) {
      console.log(`  ⏭️  ${label}: sin documentos, se omite.`);
      continue;
    }
    const col = mongoose.connection.collection(collection);
    const result = await col.deleteMany({ userCreator: TARGET_EMAIL });
    console.log(`  ✅ ${label.padEnd(22)} → ${result.deletedCount} eliminado${result.deletedCount !== 1 ? "s" : ""}`);
  }

  hr();
  console.log("\n🎉 Limpieza completada.\n");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  mongoose.disconnect();
  process.exit(1);
});
