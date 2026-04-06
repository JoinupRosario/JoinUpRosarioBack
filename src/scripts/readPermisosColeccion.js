/**
 * Solo LECTURA: conecta a MongoDB y lista todo lo que hay en la colección `permisos`.
 * No hace seed, upsert ni borrados. Sirve para inspeccionar códigos reales antes de cablear rutas/vistas.
 *
 * Uso (desde la carpeta del backend):
 *   node src/scripts/readPermisosColeccion.js
 *
 * Opcional: salida JSON a archivo
 *   node src/scripts/readPermisosColeccion.js --json > permisos-desde-db.json
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const jsonMode = process.argv.includes('--json');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Falta MONGO_URI en .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { connectTimeoutMS: 15000 });
  const coll = mongoose.connection.db.collection('permisos');

  const total = await coll.countDocuments({});
  const docs = await coll.find({}).sort({ modulo: 1, codigo: 1 }).toArray();

  if (jsonMode) {
    console.log(JSON.stringify({ total, permisos: docs }, null, 2));
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log(` Colección: permisos  |  Total documentos: ${total}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  const byMod = {};
  for (const d of docs) {
    const m = d.modulo ?? '(sin módulo)';
    if (!byMod[m]) byMod[m] = [];
    byMod[m].push(d);
  }

  for (const modulo of Object.keys(byMod).sort()) {
    console.log(`\n── Módulo: ${modulo} (${byMod[modulo].length}) ──`);
    for (const p of byMod[modulo]) {
      const cod = p.codigo ?? '?';
      const nom = p.nombre ?? '';
      console.log(`  ${String(cod).padEnd(14)} | ${nom}`);
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('Solo lectura. No se modificó nada en la base de datos.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
