import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Faculty from "../modules/faculty/model/faculty.model.js";
import Program from "../modules/program/model/program.model.js";
import ProgramFaculty from "../modules/program/model/programFaculty.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";
import City from "../modules/shared/location/models/city.schema.js";
import Sucursal from "../modules/sucursales/sucursal.model.js";
import ProgramsTypePractice from "../modules/program/model/programsTypePractices.model.js";

dotenv.config();

/** Si es 'true', borra las colecciones antes de migrar para poder volver a correr desde cero. */
const CLEAR_COLLECTIONS_BEFORE_MIGRATE = process.env.CLEAR_COLLECTIONS_BEFORE_MIGRATE === "true";

/**
 * Migra facultades y programas desde MySQL (tenant-1 o MYSQL_DATABASE)
 * a MongoDB. Colecciones: faculties, programs, program_faculties, programs_type_practices.
 *
 * La relación programa–facultad se guarda en ProgramFaculty (tabla program_faculty en MySQL):
 * cada documento tiene programId → Program y facultyId → Faculty.

 *
 * Cómo ejecutar:
 *   node src/seeders/migrateFacultiesAndProgramsFromMySQL.js
 *
 * Para vaciar esas 4 colecciones y volver a migrar desde cero (recomendado si cambiaste modelos):
 *   CLEAR_COLLECTIONS_BEFORE_MIGRATE=true node src/seeders/migrateFacultiesAndProgramsFromMySQL.js
 *
 * Orden de migraciones MySQL → MongoDB (ejecutar en este orden):
 *   1) migrateCountriesFromMySQL.js
 *   2) migrateStatesFromMySQL.js
 *   3) migrateCitiesFromMySQL.js
 *   4) migrateItemsFromMySQL.js
 *   5) migrateSucursalesFromMySQL.js o sucursales ya cargadas (sedes)
 *   6) migrateFacultiesAndProgramsFromMySQL.js (esta)
 */
const migrateFacultiesAndProgramsFromMySQL = async () => {
  try {
    console.log("🔄 Migración facultades y programas: MySQL → MongoDB\n");

    await connectDB();
    await connectMySQL();

    const dbName = process.env.MYSQL_DATABASE || "tenant-1";
    console.log(`📂 Base MySQL: ${dbName}\n`);

    if (CLEAR_COLLECTIONS_BEFORE_MIGRATE) {
      console.log("🗑️  Limpiando colecciones (faculties, programs, program_faculties, programs_type_practices)...");
      await Promise.all([
        Faculty.deleteMany({}),
        Program.deleteMany({}),
        ProgramFaculty.deleteMany({}),
        ProgramsTypePractice.deleteMany({}),
      ]);
      console.log("   ✅ Colecciones vacías. Iniciando migración.\n");
    }

    const stats = {
      faculty: { migrated: 0, skipped: 0 },
      program: { migrated: 0, skipped: 0 },
      program_faculty: { migrated: 0, skipped: 0 },
      programs_type_practices: { migrated: 0, skipped: 0 },
    };

    // --- 1. Facultades (tabla faculty - tenant-1.sql) ---
    try {
      // Mapa id sede en MySQL → código, para resolver Sucursal en MongoDB por codigo (sucursales = sedes)
      let sucursalCodigoByMysqlSedeId = new Map();
      try {
        const rowsSedes = await query("SELECT branch_id, code FROM `branch`");
        rowsSedes.forEach((s) => {
          const id = s.branch_id != null ? Number(s.branch_id) : null;
          if (id != null) sucursalCodigoByMysqlSedeId.set(id, s.code != null ? String(s.code).trim().toUpperCase() : null);
        });
      } catch (_) {
        // Tabla de sedes en MySQL puede no existir si ya se migró todo a sucursales
      }

      const rows = await query(
        "SELECT faculty_id, code, name, authorized_signer, identification_type_signer, identification_signer, identification_from_signer, position_signer, mail_signer, academic_signer, position_academic_signer, mail_academic_signer, branch_id, date_creation, user_creater, date_update, user_update, status FROM `faculty` ORDER BY faculty_id"
      );
      if (rows && rows.length > 0) {
        console.log(`📥 Facultades en MySQL: ${rows.length}`);
        for (const r of rows) {
          const pk = r.faculty_id != null ? Number(r.faculty_id) : null;
          const existing = await Faculty.findOne({ $or: [{ mysqlId: pk }, { facultyId: r.faculty_id }] });
          if (existing) {
            // Si la facultad ya existe pero no tiene sede: buscar sucursal por branchId o por codigo
            let sucursalIdExist = null;
            if (r.branch_id != null) {
              sucursalIdExist = (await Sucursal.findOne({ branchId: r.branch_id }))?._id ?? null;
              if (!sucursalIdExist) {
                const codigoSucursalExist = sucursalCodigoByMysqlSedeId.get(r.branch_id);
                if (codigoSucursalExist) sucursalIdExist = (await Sucursal.findOne({ codigo: codigoSucursalExist }))?._id ?? null;
              }
            }
            if (sucursalIdExist && !existing.sucursalId) {
              await Faculty.updateOne({ _id: existing._id }, { $set: { sucursalId: sucursalIdExist } });
            }
            stats.faculty.skipped++;
            continue;
          }
          const identificationFromSigner = r.identification_from_signer != null
            ? (await City.findOne({ mysqlId: r.identification_from_signer }))?._id : null;
          // Resolver sucursal: primero por branchId (tabla sucursales), si no por codigo (mapeo MySQL branch)
          let sucursalId = null;
          if (r.branch_id != null) {
            sucursalId = (await Sucursal.findOne({ branchId: r.branch_id }))?._id ?? null;
            if (!sucursalId) {
              const codigoSucursal = sucursalCodigoByMysqlSedeId.get(r.branch_id);
              if (codigoSucursal) sucursalId = (await Sucursal.findOne({ codigo: codigoSucursal }))?._id ?? null;
            }
          }
          const identificationTypeSigner = r.identification_type_signer != null
            ? (await Item.findOne({ mysqlId: r.identification_type_signer }))?._id : null;
          await Faculty.create({
            mysqlId: pk,
            facultyId: r.faculty_id,
            code: r.code ?? "",
            name: r.name ?? "",
            authorizedSigner: r.authorized_signer ?? null,
            identificationTypeSigner,
            identificationSigner: r.identification_signer ?? null,
            identificationFromSigner,
            positionSigner: r.position_signer ?? null,
            mailSigner: r.mail_signer ?? null,
            academicSigner: r.academic_signer ?? null,
            positionAcademicSigner: r.position_academic_signer ?? null,
            mailAcademicSigner: r.mail_academic_signer ?? null,
            sucursalId,
            dateCreation: r.date_creation ?? null,
            userCreator: r.user_creater ?? null,
            dateUpdate: r.date_update ?? null,
            userUpdater: r.user_update ?? null,
            status: r.status ?? "",
          });
          stats.faculty.migrated++;
        }
        console.log(`   ✅ Facultades migradas: ${stats.faculty.migrated}, omitidas: ${stats.faculty.skipped}\n`);

        // Asignar sucursal por defecto a facultades que siguen sin sede (p. ej. migración sin sucursales o códigos no coincidentes)
        const facultadesSinSede = await Faculty.find({ sucursalId: { $in: [null, undefined] } }).limit(5000);
        if (facultadesSinSede.length > 0) {
          const sucursalPorDefecto = await Sucursal.findOne({ codigo: "ROSARIO_PRINCIPAL" }) ?? await Sucursal.findOne();
          if (sucursalPorDefecto) {
            const result = await Faculty.updateMany(
              { sucursalId: { $in: [null, undefined] } },
              { $set: { sucursalId: sucursalPorDefecto._id } }
            );
            if (result.modifiedCount > 0) {
              console.log(`   🔗 Sucursal por defecto asignada a ${result.modifiedCount} facultad(es) sin sede.\n`);
            }
          }
        }
      } else {
        console.log("⚠️  No hay registros en `faculty`\n");
      }
    } catch (err) {
      if (err.message && (err.message.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE")) {
        console.log("⚠️  Tabla `faculty` no existe en MySQL. Omitiendo facultades.\n");
      } else {
        throw err;
      }
    }

    // --- 2. Programas (tabla program - tenant-1.sql) ---
    try {
      const rows = await query(
        "SELECT id, code, name, level, label_level, status, type_practice_id, date_creation, user_creator, date_update, user_updater FROM `program` ORDER BY id"
      );
      if (rows && rows.length > 0) {
        console.log(`📥 Programas en MySQL: ${rows.length}`);
        for (const r of rows) {
          const pk = r.id != null ? Number(r.id) : null;
          const existing = await Program.findOne({ mysqlId: pk });
          if (existing) {
            stats.program.skipped++;
            continue;
          }
          const typePractice = r.type_practice_id != null
            ? (await Item.findOne({ mysqlId: r.type_practice_id }))?._id : null;
          await Program.create({
            mysqlId: pk,
            code: r.code ?? "",
            name: r.name ?? "",
            level: (r.level != null && String(r.level).trim() !== "") ? String(r.level).trim() : "",
            labelLevel: r.label_level ?? null,
            status: r.status ?? null,
            typePractice,
            dateCreation: r.date_creation ?? null,
            userCreator: r.user_creator ?? null,
            dateUpdate: r.date_update ?? null,
            userUpdater: r.user_updater ?? null,
          });
          stats.program.migrated++;
        }
        console.log(`   ✅ Programas migrados: ${stats.program.migrated}, omitidos: ${stats.program.skipped}\n`);
      } else {
        console.log("⚠️  No hay registros en `program`\n");
      }
    } catch (err) {
      if (err.message && (err.message.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE")) {
        console.log("⚠️  Tabla `program` no existe en MySQL. Omitiendo programas.\n");
      } else {
        throw err;
      }
    }

    // --- 3. ProgramFaculty (tabla program_faculty - tenant-1.sql) ---
    try {
      const rows = await query(
        "SELECT program_faculty_id, program_id, faculty_id, code, snies, cost_centre, official_registration, practice_duration, official_registration_date, status, date_creation, user_creator, date_update, user_updater FROM `program_faculty` ORDER BY program_faculty_id"
      );
      if (rows && rows.length > 0) {
        console.log(`📥 ProgramFaculty en MySQL: ${rows.length}`);
        for (const r of rows) {
          const pk = r.program_faculty_id != null ? Number(r.program_faculty_id) : null;
          const existing = await ProgramFaculty.findOne({ $or: [{ mysqlId: pk }, { programFacultyId: r.program_faculty_id }] });
          if (existing) {
            stats.program_faculty.skipped++;
            continue;
          }
          // Resolver refs (buscar por mysqlId o por compatibilidad mysql_id / facultyId)
          const programId = r.program_id != null
            ? (await Program.findOne({ $or: [{ mysqlId: r.program_id }, { mysql_id: r.program_id }] }))?._id
            : null;
          const facultyId = r.faculty_id != null
            ? (await Faculty.findOne({ $or: [{ mysqlId: r.faculty_id }, { facultyId: r.faculty_id }, { faculty_id: r.faculty_id }] }))?._id
            : null;
          await ProgramFaculty.create({
            mysqlId: pk,
            programFacultyId: r.program_faculty_id,
            programId,
            facultyId,
            program_id: r.program_id ?? null,
            faculty_id: r.faculty_id ?? null,
            code: r.code ?? null,
            snies: r.snies ?? null,
            costCentre: r.cost_centre ?? null,
            officialRegistration: r.official_registration ?? null,
            practiceDuration: r.practice_duration ?? null,
            officialRegistrationDate: r.official_registration_date ?? null,
            status: r.status ?? "ACTIVE",
            dateCreation: r.date_creation ?? null,
            userCreator: r.user_creator ?? null,
            dateUpdate: r.date_update ?? null,
            userUpdater: r.user_updater ?? null,
          });
          stats.program_faculty.migrated++;
        }
        console.log(`   ✅ ProgramFaculty migrados: ${stats.program_faculty.migrated}, omitidos: ${stats.program_faculty.skipped}\n`);
      } else {
        console.log("⚠️  No hay registros en `program_faculty`\n");
      }
    } catch (err) {
      if (err.message && (err.message.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE")) {
        console.log("⚠️  Tabla `program_faculty` no existe en MySQL. Omitiendo.\n");
      } else {
        throw err;
      }
    }

    // --- 3b. Rellenar programId/facultyId en ProgramFaculty que tengan refs vacías (p. ej. migración anterior) ---
    try {
      const pfWithoutRefs = await ProgramFaculty.find({
        $or: [
          { programId: { $in: [null, undefined] } },
          { facultyId: { $in: [null, undefined] } },
        ],
      }).limit(5000);
      if (pfWithoutRefs.length > 0) {
        const rows = await query("SELECT program_faculty_id, program_id, faculty_id FROM `program_faculty`");
        const mapByPk = new Map();
        rows.forEach((row) => {
          const pk = row.program_faculty_id != null ? Number(row.program_faculty_id) : null;
          if (pk != null) mapByPk.set(pk, { program_id: row.program_id, faculty_id: row.faculty_id });
        });
        let updated = 0;
        for (const pf of pfWithoutRefs) {
          const pk = pf.mysqlId ?? pf.programFacultyId ?? null;
          if (pk == null) continue;
          const row = mapByPk.get(pk);
          if (!row) continue;
          const updates = {};
          if (row.program_id != null) {
            if (!pf.programId) {
              const prog = await Program.findOne({ $or: [{ mysqlId: row.program_id }, { mysql_id: row.program_id }] });
              if (prog) updates.programId = prog._id;
            }
            updates.program_id = row.program_id;
          }
          if (row.faculty_id != null) {
            if (!pf.facultyId) {
              const fac = await Faculty.findOne({ $or: [{ mysqlId: row.faculty_id }, { facultyId: row.faculty_id }, { faculty_id: row.faculty_id }] });
              if (fac) updates.facultyId = fac._id;
            }
            updates.faculty_id = row.faculty_id;
          }
          if (Object.keys(updates).length) {
            await ProgramFaculty.updateOne({ _id: pf._id }, { $set: updates });
            updated++;
          }
        }
        if (updated) console.log(`🔗 Refs programId/facultyId rellenadas en ProgramFaculty: ${updated}\n`);
      }
      // Rellenar program_id/faculty_id en los que no los tengan (para fallback en la API)
      const pfSinIds = await ProgramFaculty.find({
        $or: [{ program_id: { $in: [null, undefined] } }, { faculty_id: { $in: [null, undefined] } }],
      }).limit(5000);
      if (pfSinIds.length > 0) {
        const rows = await query("SELECT program_faculty_id, program_id, faculty_id FROM `program_faculty`");
        const mapByPk = new Map();
        rows.forEach((row) => {
          const pk = row.program_faculty_id != null ? Number(row.program_faculty_id) : null;
          if (pk != null) mapByPk.set(pk, { program_id: row.program_id, faculty_id: row.faculty_id });
        });
        let updatedIds = 0;
        for (const pf of pfSinIds) {
          const pk = pf.mysqlId ?? pf.programFacultyId ?? null;
          const row = pk != null ? mapByPk.get(pk) : null;
          if (!row) continue;
          const up = {};
          if (pf.program_id == null && row.program_id != null) up.program_id = row.program_id;
          if (pf.faculty_id == null && row.faculty_id != null) up.faculty_id = row.faculty_id;
          if (Object.keys(up).length) {
            await ProgramFaculty.updateOne({ _id: pf._id }, { $set: up });
            updatedIds++;
          }
        }
        if (updatedIds) console.log(`🔗 program_id/faculty_id rellenados en ProgramFaculty: ${updatedIds}\n`);
      }
    } catch (err) {
      if (err.message && err.message.includes("doesn't exist")) {
        // Tabla no existe, ignorar
      } else {
        console.warn("⚠️  Paso 3b (rellenar refs ProgramFaculty):", err.message);
      }
    }

    // --- 4. Programs_type_practices (tabla programs_type_practices - tenant-1.sql) ---
    try {
      const rows = await query(
        "SELECT id, program_id, type_practice_id, program_faculty_id FROM `programs_type_practices` ORDER BY id"
      );
      if (rows && rows.length > 0) {
        console.log(`📥 Programs_type_practices en MySQL: ${rows.length}`);
        for (const r of rows) {
          const pk = r.id != null ? Number(r.id) : null;
          const existing = await ProgramsTypePractice.findOne({ mysqlId: pk });
          if (existing) {
            stats.programs_type_practices.skipped++;
            continue;
          }
          const program = r.program_id != null ? (await Program.findOne({ mysqlId: r.program_id }))?._id : null;
          const programFaculty = r.program_faculty_id != null ? (await ProgramFaculty.findOne({ mysqlId: r.program_faculty_id }))?._id : null;
          const typePractice = r.type_practice_id != null ? (await Item.findOne({ mysqlId: r.type_practice_id }))?._id : null;
          await ProgramsTypePractice.create({
            mysqlId: pk,
            program,
            programFaculty,
            typePractice,
          });
          stats.programs_type_practices.migrated++;
        }
        console.log(`   ✅ Programs_type_practices migrados: ${stats.programs_type_practices.migrated}, omitidos: ${stats.programs_type_practices.skipped}\n`);
      } else {
        console.log("⚠️  No hay registros en `programs_type_practices`\n");
      }
    } catch (err) {
      if (err.message && (err.message.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE")) {
        console.log("⚠️  Tabla `programs_type_practices` no existe en MySQL. Omitiendo.\n");
      } else {
        throw err;
      }
    }

    console.log("🎉 Resumen:");
    console.log(`   Faculty:                ${stats.faculty.migrated} migradas, ${stats.faculty.skipped} omitidas`);
    console.log(`   Program:                ${stats.program.migrated} migrados, ${stats.program.skipped} omitidos`);
    console.log(`   ProgramFaculty:         ${stats.program_faculty.migrated} migrados, ${stats.program_faculty.skipped} omitidos`);
    console.log(`   ProgramsTypePractices:  ${stats.programs_type_practices.migrated} migrados, ${stats.programs_type_practices.skipped} omitidos`);

    await closePool();
    process.exit(0);
  } catch (error) {
    console.error("💥 Error en migración:", error);
    await closePool().catch(() => {});
    process.exit(1);
  }
};

migrateFacultiesAndProgramsFromMySQL();
