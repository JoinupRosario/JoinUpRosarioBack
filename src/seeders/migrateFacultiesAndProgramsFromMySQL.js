import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Faculty from "../modules/faculty/model/faculty.model.js";
import Program from "../modules/program/model/program.model.js";
import ProgramFaculty from "../modules/program/model/programFaculty.model.js";
import ProgramsTypePractice from "../modules/program/model/programsTypePractices.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";
import City from "../modules/shared/location/models/city.schema.js";
import Sucursal from "../modules/sucursales/sucursal.model.js";

dotenv.config();

const dbName = process.env.MYSQL_DATABASE || "tenant-1";

const runQuery = (sql) => query(sql).catch((err) => {
  if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
  throw err;
});

/**
 * Migra facultades, programas, program_faculty y programs_type_practices desde MySQL a MongoDB.
 * Inserta solo registros que no existan (por mysqlId); si ya existe se omite.
 * Orden previo: countries, states, cities, items, sucursales.
 * Ejecutar: node src/seeders/migrateFacultiesAndProgramsFromMySQL.js
 */
async function migrate() {
  console.log("🔄 Migración facultades y programas: MySQL → MongoDB\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}\n`);

  const stats = { faculty: 0, program: 0, program_faculty: 0, programs_type_practices: 0, skipped: { faculty: 0, program: 0, program_faculty: 0, programs_type_practices: 0 } };

  // --- Mapas de lookup (MongoDB) ---
  const sucursales = await Sucursal.find({}).lean();
  const sucursalByBranchId = new Map(sucursales.filter((s) => s.branchId != null).map((s) => [s.branchId, s._id]));
  const sucursalByCodigo = new Map(sucursales.map((s) => [String(s.codigo || "").toUpperCase(), s._id]));

  let branchCodeById = new Map();
  try {
    const branchRows = await query("SELECT branch_id, code FROM `branch`");
    branchRows.forEach((r) => {
      const id = r.branch_id != null ? Number(r.branch_id) : null;
      if (id != null && r.code != null) branchCodeById.set(id, String(r.code).trim().toUpperCase());
    });
  } catch (_) {}

  const cities = await City.find({}).lean();
  const cityByMysqlId = new Map(cities.filter((c) => c.mysqlId != null).map((c) => [c.mysqlId, c._id]));

  const items = await Item.find({}).lean();
  const itemByMysqlId = new Map(items.filter((i) => i.mysqlId != null).map((i) => [i.mysqlId, i._id]));

  const existingFacultyIds = new Set();
  const existingProgramIds = new Set();
  const existingPfIds = new Set();
  const existingPtpIds = new Set();
  (await Faculty.find({}).select("mysqlId facultyId").lean()).forEach((f) => {
    if (f.mysqlId != null) existingFacultyIds.add(f.mysqlId);
    if (f.facultyId != null) existingFacultyIds.add(f.facultyId);
  });
  (await Program.find({}).select("mysqlId").lean()).forEach((p) => { if (p.mysqlId != null) existingProgramIds.add(p.mysqlId); });
  (await ProgramFaculty.find({}).select("mysqlId").lean()).forEach((pf) => { if (pf.mysqlId != null) existingPfIds.add(pf.mysqlId); });
  (await ProgramsTypePractice.find({}).select("mysqlId").lean()).forEach((ptp) => { if (ptp.mysqlId != null) existingPtpIds.add(ptp.mysqlId); });

  // --- 1. Facultades ---
  const facultyRows = await runQuery(
    "SELECT faculty_id, code, name, authorized_signer, identification_type_signer, identification_signer, identification_from_signer, position_signer, mail_signer, academic_signer, position_academic_signer, mail_academic_signer, branch_id, date_creation, user_creater, date_update, user_update, status FROM `faculty` ORDER BY faculty_id"
  );
  console.log(`📥 Facultades en MySQL: ${facultyRows.length}`);

  for (const r of facultyRows) {
    const pk = r.faculty_id != null ? Number(r.faculty_id) : null;
    if (pk != null && existingFacultyIds.has(pk)) {
      stats.skipped.faculty++;
      continue;
    }
    const branchId = r.branch_id != null ? Number(r.branch_id) : null;
    let sucursalId = sucursalByBranchId.get(branchId) ?? null;
    if (!sucursalId && branchId != null) {
      const codigo = branchCodeById.get(branchId);
      if (codigo) sucursalId = sucursalByCodigo.get(codigo) ?? null;
    }

    await Faculty.create({
      mysqlId: r.faculty_id != null ? Number(r.faculty_id) : null,
      facultyId: r.faculty_id ?? null,
      code: r.code ?? "",
      name: r.name ?? "",
      authorizedSigner: r.authorized_signer ?? null,
      identificationTypeSigner: itemByMysqlId.get(r.identification_type_signer) ?? null,
      identificationSigner: r.identification_signer ?? null,
      identificationFromSigner: cityByMysqlId.get(r.identification_from_signer) ?? null,
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
    stats.faculty++;
    if (pk != null) existingFacultyIds.add(pk);
  }
  console.log(`   ✅ Facultades: ${stats.faculty} creadas${stats.skipped.faculty ? `, ${stats.skipped.faculty} omitidas` : ""}\n`);

  const facultadesSinSede = await Faculty.countDocuments({ sucursalId: { $in: [null, undefined] } });
  if (facultadesSinSede > 0) {
    const sucursalDef = await Sucursal.findOne({ codigo: "ROSARIO_PRINCIPAL" }) ?? await Sucursal.findOne();
    if (sucursalDef) {
      const up = await Faculty.updateMany(
        { sucursalId: { $in: [null, undefined] } },
        { $set: { sucursalId: sucursalDef._id } }
      );
      console.log(`   🔗 Sucursal por defecto asignada a ${up.modifiedCount} facultad(es).\n`);
    }
  }

  // --- 2. Programas ---
  const programRows = await runQuery(
    "SELECT id, code, name, level, label_level, status, type_practice_id, date_creation, user_creator, date_update, user_updater FROM `program` ORDER BY id"
  );
  console.log(`📥 Programas en MySQL: ${programRows.length}`);

  for (const r of programRows) {
    const pk = r.id != null ? Number(r.id) : null;
    if (pk != null && existingProgramIds.has(pk)) {
      stats.skipped.program++;
      continue;
    }
    await Program.create({
      mysqlId: r.id != null ? Number(r.id) : null,
      code: r.code ?? "",
      name: r.name ?? "",
      level: (r.level != null && String(r.level).trim() !== "") ? String(r.level).trim() : "",
      labelLevel: r.label_level ?? null,
      status: r.status ?? null,
      typePractice: itemByMysqlId.get(r.type_practice_id) ?? null,
      dateCreation: r.date_creation ?? null,
      userCreator: r.user_creator ?? null,
      dateUpdate: r.date_update ?? null,
      userUpdater: r.user_updater ?? null,
    });
    stats.program++;
    if (pk != null) existingProgramIds.add(pk);
  }
  console.log(`   ✅ Programas: ${stats.program} creados${stats.skipped.program ? `, ${stats.skipped.program} omitidos` : ""}\n`);

  // --- Mapas para ProgramFaculty (por mysqlId) ---
  const programs = await Program.find({}).select("_id mysqlId").lean();
  const programByMysqlId = new Map(programs.filter((p) => p.mysqlId != null).map((p) => [p.mysqlId, p._id]));

  const faculties = await Faculty.find({}).select("_id mysqlId facultyId").lean();
  const facultyByMysqlId = new Map();
  faculties.forEach((f) => {
    if (f.mysqlId != null) facultyByMysqlId.set(f.mysqlId, f._id);
    if (f.facultyId != null) facultyByMysqlId.set(f.facultyId, f._id);
  });

  // --- 3. ProgramFaculty (solo si existen programId y facultyId) ---
  const pfRows = await runQuery(
    "SELECT program_faculty_id, program_id, faculty_id, code, snies, cost_centre, official_registration, practice_duration, official_registration_date, status, date_creation, user_creator, date_update, user_updater FROM `program_faculty` ORDER BY program_faculty_id"
  );
  console.log(`📥 Program_faculty en MySQL: ${pfRows.length}`);

  let pfSkipped = 0;
  for (const r of pfRows) {
    const pk = r.program_faculty_id != null ? Number(r.program_faculty_id) : null;
    if (pk != null && existingPfIds.has(pk)) {
      stats.skipped.program_faculty++;
      continue;
    }
    const programId = r.program_id != null ? programByMysqlId.get(Number(r.program_id)) : null;
    const facultyId = r.faculty_id != null ? facultyByMysqlId.get(Number(r.faculty_id)) : null;
    if (!programId || !facultyId) {
      pfSkipped++;
      continue;
    }
    await ProgramFaculty.create({
      mysqlId: r.program_faculty_id != null ? Number(r.program_faculty_id) : null,
      programFacultyId: r.program_faculty_id ?? null,
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
    stats.program_faculty++;
    if (pk != null) existingPfIds.add(pk);
  }
  console.log(`   ✅ ProgramFaculty: ${stats.program_faculty} creados${stats.skipped.program_faculty ? `, ${stats.skipped.program_faculty} omitidos` : ""} (sin ref: ${pfSkipped})\n`);

  // --- Mapas para ProgramsTypePractice ---
  const programFaculties = await ProgramFaculty.find({}).select("_id mysqlId").lean();
  const programFacultyByMysqlId = new Map(programFaculties.filter((pf) => pf.mysqlId != null).map((pf) => [pf.mysqlId, pf._id]));

  // --- 4. Programs_type_practices ---
  const ptpRows = await runQuery(
    "SELECT id, program_id, type_practice_id, program_faculty_id FROM `programs_type_practices` ORDER BY id"
  );
  console.log(`📥 Programs_type_practices en MySQL: ${ptpRows.length}`);

  for (const r of ptpRows) {
    const pk = r.id != null ? Number(r.id) : null;
    if (pk != null && existingPtpIds.has(pk)) {
      stats.skipped.programs_type_practices++;
      continue;
    }
    const programId = r.program_id != null ? programByMysqlId.get(Number(r.program_id)) : null;
    const programFacultyId = r.program_faculty_id != null ? programFacultyByMysqlId.get(Number(r.program_faculty_id)) : null;
    const typePracticeId = r.type_practice_id != null ? itemByMysqlId.get(Number(r.type_practice_id)) : null;

    await ProgramsTypePractice.create({
      mysqlId: pk ?? null,
      program: programId ?? null,
      programFaculty: programFacultyId ?? null,
      typePractice: typePracticeId ?? null,
    });
    stats.programs_type_practices++;
    if (pk != null) existingPtpIds.add(pk);
  }
  console.log(`   ✅ Programs_type_practices: ${stats.programs_type_practices} creados${stats.skipped.programs_type_practices ? `, ${stats.skipped.programs_type_practices} omitidos` : ""}\n`);

  console.log("🎉 Resumen:");
  console.log(`   faculties: ${stats.faculty} creadas${stats.skipped.faculty ? `, ${stats.skipped.faculty} omitidas` : ""}`);
  console.log(`   programs: ${stats.program} creados${stats.skipped.program ? `, ${stats.skipped.program} omitidos` : ""}`);
  console.log(`   program_faculties: ${stats.program_faculty} creados${stats.skipped.program_faculty ? `, ${stats.skipped.program_faculty} omitidos` : ""}`);
  console.log(`   programs_type_practices: ${stats.programs_type_practices} creados${stats.skipped.programs_type_practices ? `, ${stats.skipped.programs_type_practices} omitidos` : ""}`);

  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("💥 Error:", err);
  closePool().catch(() => {});
  process.exit(1);
});
