import dotenv from "dotenv";
import connectDB from "../config/db.js";
import Periodo, { TIPO_PERIODO } from "../modules/periodos/periodo.model.js";

dotenv.config();

/**
 * Ajusta el campo `tipo` en todos los documentos de la colección periodos.
 * Regla (igual que en academic_period):
 * - Si solo fechaSistemaAcademico tiene valor (inicio o fin) y el resto de fechas son null → monitoria.
 * - Si alguna fecha de práctica/autorización/legalización/publicar tiene valor → practica.
 *
 * Útil para documentos migrados antes de tener el campo tipo o creados sin tipo.
 *
 * Ejecutar:
 *   node src/seeders/backfillPeriodoTipo.js
 */
function hasValue(obj) {
  if (obj == null) return false;
  if (typeof obj === "object" && (obj.inicio != null || obj.fin != null)) {
    return true;
  }
  return obj != null && obj !== "";
}

function inferTipoFromDoc(doc) {
  const sa = doc.fechaSistemaAcademico;
  const hasSistema = hasValue(sa?.inicio) || hasValue(sa?.fin);
  const hasPractica =
    hasValue(doc.fechaInicioPractica?.inicio) ||
    hasValue(doc.fechaInicioPractica?.fin) ||
    hasValue(doc.fechaMaxFinPractica) ||
    hasValue(doc.fechaAutorizacion?.inicio) ||
    hasValue(doc.fechaAutorizacion?.fin) ||
    hasValue(doc.fechaLegalizacion?.inicio) ||
    hasValue(doc.fechaLegalizacion?.fin) ||
    hasValue(doc.fechaPublicarOfertas?.inicio) ||
    hasValue(doc.fechaPublicarOfertas?.fin);
  return hasSistema && !hasPractica ? TIPO_PERIODO.MONITORIA : TIPO_PERIODO.PRACTICA;
}

const backfillPeriodoTipo = async () => {
  try {
    console.log("🔄 Backfill tipo en colección periodos\n");

    await connectDB();

    const docs = await Periodo.find({}).lean();
    console.log(`📥 Documentos en periodos: ${docs.length}`);

    let updated = 0;
    let unchanged = 0;

    for (const doc of docs) {
      const inferred = inferTipoFromDoc(doc);
      const current = doc.tipo ?? "(sin tipo)";
      const needsUpdate = doc.tipo === undefined || doc.tipo !== inferred;
      if (!needsUpdate) {
        unchanged++;
        continue;
      }
      await Periodo.updateOne({ _id: doc._id }, { $set: { tipo: inferred } });
      updated++;
      console.log(`   ${doc.codigo} (${doc._id}): ${current} → ${inferred}`);
    }

    console.log(`\n   ✅ Actualizados: ${updated}, ya correctos/sin cambio: ${unchanged}\n`);
    process.exit(0);
  } catch (error) {
    console.error("💥 Error en backfill:", error);
    process.exit(1);
  }
};

backfillPeriodoTipo();
