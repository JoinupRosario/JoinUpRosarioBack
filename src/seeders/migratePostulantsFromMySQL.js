/**
 * Migración postulant + postulant_profile + profile_* desde MySQL (tenant-1) a MongoDB.
 *
 * TRAZABILIDAD MySQL ↔ MongoDB:
 * - El _id de MongoDB NO es el mismo que el id de MySQL. Para no mezclar sistemas se usa el campo mysqlId.
 * - Cada documento migrado guarda en mysqlId el id (PK) que tenía en MySQL.
 * - La idempotencia y los cruces entre colecciones se gestionan siempre por mysqlId:
 *   · "ya existe" = existe un documento con ese mysqlId en Mongo.
 *   · Mapas *ByMysqlId: clave = id MySQL → valor = _id MongoDB (para referencias entre colecciones).
 * - Las referencias en Mongo (postulantId, profileId, etc.) son ObjectId (_id), pero la resolución
 *   desde datos MySQL se hace mediante estos mapas (mysqlId → _id).
 *
 * Tablas según tenant-1.sql: postulant (~2016), postulant_profile (~2045), profile_*.
 * Ejecutar: node src/seeders/migratePostulantsFromMySQL.js
 */

import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { connectMySQL, query, closePool } from "../config/mysql.js";
import Postulant from "../modules/postulants/models/postulants.schema.js";
import PostulantProfile from "../modules/postulants/models/profile/profile.schema.js";
import User from "../modules/users/user.model.js";
import Item from "../modules/shared/reference-data/models/item.schema.js";
import Country from "../modules/shared/location/models/country.schema.js";
import State from "../modules/shared/location/models/state.schema.js";
import City from "../modules/shared/location/models/city.schema.js";
import Program from "../modules/program/model/program.model.js";
import ProgramFaculty from "../modules/program/model/programFaculty.model.js";
import Attachment from "../modules/shared/attachment/attachment.schema.js";
import Skill from "../modules/shared/skill/skill.schema.js";
import {
  ProfileAward,
  ProfileCv,
  ProfileEnrolledProgram,
  ProfileGraduateProgram,
  ProfileInfoPermission,
  ProfileInterestArea,
  ProfileLanguage,
  ProfileOtherStudy,
  ProfileProfileVersion,
  ProfileProgramExtraInfo,
  ProfileReference,
  ProfileSkill,
  ProfileSupport,
  ProfileWorkExperience,
} from "../modules/postulants/models/profile/index.js";

dotenv.config();

const dbName = process.env.MYSQL_DATABASE || "tenant-1";

/** Tamaño de lote para no saturar memoria ni MongoDB (50k+ postulantes). */
const BATCH_SIZE = 2000;

const runQuery = (sql, params = []) =>
  query(sql, params).catch((err) => {
    if (err.message?.includes("doesn't exist") || err.code === "ER_NO_SUCH_TABLE") return [];
    throw err;
  });

/** Nombre de la tabla de perfiles en MySQL. Según tenant-1.sql línea 2045: CREATE TABLE `postulant_profile`. */
const MYSQL_TABLE_POSTULANT_PROFILE = "postulant_profile";

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function date(v) {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function str(v) {
  return v != null ? String(v).trim() : null;
}

function bool(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return String(v) === "1" || String(v).toLowerCase() === "true";
}

async function migrate() {
  console.log("🔄 Migración postulantes y perfiles: MySQL → MongoDB\n");
  console.log("⚠️  No interrumpir (Ctrl+C) hasta terminar. Si se corta, puede volver a ejecutar y continuará.\n");
  await connectDB();
  await connectMySQL();
  console.log(`📂 MySQL: ${dbName}\n`);

  const stats = {
    postulant: 0,
    postulant_profile: 0,
    profile_awards: 0,
    profile_cv: 0,
    profile_enrolled_program: 0,
    profile_graduate_program: 0,
    profile_info_permissions: 0,
    profile_interest_areas: 0,
    profile_language: 0,
    profile_other_studies: 0,
    profile_profile_version: 0,
    profile_program_extra_info: 0,
    profile_references: 0,
    profile_skill: 0,
    profile_supports: 0,
    profile_work_experiences: 0,
    skippedPostulantNoUser: 0,
    skippedPostulantAlreadyExists: 0,
    skippedProfileNoPostulant: 0,
    skippedProfileAlreadyExists: 0,
    postulantCreatedForProfile: 0,
    skipped: {},
  };

  // --- Mapas MongoDB: clave = id MySQL (mysqlId), valor = _id Mongo. Trazabilidad y referencias. ---
  const items = await Item.find({}).select("mysqlId _id").lean();
  const itemByMysqlId = new Map(items.filter((i) => i.mysqlId != null).map((i) => [i.mysqlId, i._id]));

  const countries = await Country.find({}).select("mysqlId _id").lean();
  const countryByMysqlId = new Map(countries.filter((c) => c.mysqlId != null).map((c) => [c.mysqlId, c._id]));

  const states = await State.find({}).select("mysqlId _id").lean();
  const stateByMysqlId = new Map(states.filter((s) => s.mysqlId != null).map((s) => [s.mysqlId, s._id]));

  const cities = await City.find({}).select("mysqlId _id").lean();
  const cityByMysqlId = new Map(cities.filter((c) => c.mysqlId != null).map((c) => [c.mysqlId, c._id]));

  const programs = await Program.find({}).select("mysqlId _id").lean();
  const programByMysqlId = new Map(programs.filter((p) => p.mysqlId != null).map((p) => [p.mysqlId, p._id]));

  const programFaculties = await ProgramFaculty.find({}).select("mysqlId programFacultyId _id").lean();
  const programFacultyByMysqlId = new Map(
    programFaculties.filter((pf) => pf.mysqlId != null).map((pf) => [pf.mysqlId, pf._id])
  );
  programFaculties.forEach((pf) => {
    if (pf.programFacultyId != null && !programFacultyByMysqlId.has(pf.programFacultyId))
      programFacultyByMysqlId.set(pf.programFacultyId, pf._id);
  });

  const attachments = await Attachment.find({}).select("mysqlId _id").lean();
  const attachmentByMysqlId = new Map(
    attachments.filter((a) => a.mysqlId != null).map((a) => [a.mysqlId, a._id])
  );

  const skills = await Skill.find({}).select("mysqlId _id").lean();
  const skillByMysqlId = new Map(skills.filter((s) => s.mysqlId != null).map((s) => [s.mysqlId, s._id]));

  // User: MySQL user.id → MongoDB User._id. Primero por User.mysqlId (si existe), luego por code/email.
  const mongoUsersWithMysqlId = await User.find({ mysqlId: { $exists: true, $ne: null } }).select("mysqlId _id").lean();
  const userByMysqlId = new Map(mongoUsersWithMysqlId.map((u) => [u.mysqlId, u._id]));
  const mysqlUsers = await runQuery("SELECT id, identification, user_name, personal_email FROM `user`");
  const mongoUsersAll = await User.find({}).select("_id code email mysqlId").lean();
  for (const mu of mysqlUsers) {
    const id = num(mu.id);
    if (id == null || userByMysqlId.has(id)) continue;
    const code = str(mu.identification) || str(mu.user_name);
    const email = str(mu.personal_email) || str(mu.user_name);
    const found = mongoUsersAll.find(
      (u) =>
        (code && u.code && String(u.code).trim() === code) ||
        (email && u.email && String(u.email).toLowerCase() === email.toLowerCase())
    );
    if (found) userByMysqlId.set(id, found._id);
  }
  console.log(`   👤 Usuarios mapeados MySQL→Mongo: ${userByMysqlId.size} (por mysqlId: ${mongoUsersWithMysqlId.length}, por code/email: ${userByMysqlId.size - mongoUsersWithMysqlId.length})\n`);

  // --- 1. Postulant (por lotes). Idempotencia por mysqlId: omitir si ya existe doc con ese mysqlId. ---
  let existingPostulantIds = new Set((await Postulant.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean));
  let lastPostulantId = 0;
  let totalPostulantRows = 0;
  while (true) {
    const postulantRows = await runQuery(
      `SELECT type_of_identification, gender, dateBirth, country_birth_id, state_birth_id, city_birth_id, phone, address, country_residence_id, state_residence_id, city_residence_id, alternate_email, linkedin_link, instagram, twitter, personal_website, photo_id, filling_percentage, filled, postulant_id FROM \`postulant\` WHERE postulant_id > ? ORDER BY postulant_id LIMIT ${BATCH_SIZE}`,
      [lastPostulantId]
    );
    if (!postulantRows || postulantRows.length === 0) break;
    totalPostulantRows += postulantRows.length;
    const toInsert = [];
    for (const r of postulantRows) {
      const postulantIdMysql = num(r.postulant_id);
      if (postulantIdMysql == null) continue;
      lastPostulantId = postulantIdMysql;
      const userId = userByMysqlId.get(postulantIdMysql);
      if (!userId) {
        stats.skippedPostulantNoUser++;
        continue;
      }
      if (existingPostulantIds.has(postulantIdMysql)) {
        stats.skippedPostulantAlreadyExists++;
        continue;
      }
      toInsert.push({
        postulantId: userId,
        mysqlId: postulantIdMysql,
        typeOfIdentification: itemByMysqlId.get(num(r.type_of_identification)) ?? null,
        gender: itemByMysqlId.get(num(r.gender)) ?? null,
        dateBirth: date(r.dateBirth),
        countryBirthId: countryByMysqlId.get(num(r.country_birth_id)) ?? null,
        stateBirthId: stateByMysqlId.get(num(r.state_birth_id)) ?? null,
        cityBirthId: cityByMysqlId.get(num(r.city_birth_id)) ?? null,
        phone: str(r.phone),
        address: str(r.address),
        countryResidenceId: countryByMysqlId.get(num(r.country_residence_id)) ?? null,
        stateResidenceId: stateByMysqlId.get(num(r.state_residence_id)) ?? null,
        cityResidenceId: cityByMysqlId.get(num(r.city_residence_id)) ?? null,
        alternateEmail: str(r.alternate_email) || "",
        linkedinLink: str(r.linkedin_link),
        instagram: str(r.instagram),
        twitter: str(r.twitter),
        personalWebsite: str(r.personal_website),
        photoId: attachmentByMysqlId.get(num(r.photo_id)) ?? num(r.photo_id) ?? null,
        fillingPercentage: num(r.filling_percentage) ?? 0,
        filled: bool(r.filled),
      });
      existingPostulantIds.add(postulantIdMysql);
    }
    if (toInsert.length > 0) {
      await Postulant.insertMany(toInsert);
      stats.postulant += toInsert.length;
      console.log(`   📦 Postulant: lote insertado ${toInsert.length} (total migrados: ${stats.postulant})`);
    }
  }
  console.log(`   ✅ Postulant: ${stats.postulant} creados (leídos ${totalPostulantRows} de MySQL)`);
  console.log(`   ⏭️  Omitidos: sin usuario: ${stats.skippedPostulantNoUser}, ya existían: ${stats.skippedPostulantAlreadyExists}\n`);

  // Mapa id MySQL (postulant_id) → _id Mongo. Resolución por mysqlId para referencias desde postulant_profile.
  const postulants = await Postulant.find({}).select("mysqlId _id postulantId").lean();
  const postulantByMysqlId = new Map(postulants.filter((p) => p.mysqlId != null).map((p) => [p.mysqlId, p._id]));
  const postulantByUserId = new Map(postulants.map((p) => [p.postulantId?.toString(), p._id]));

  const resolvePostulantIdForProfile = async (mysqlPostulantId) => {
    const pid = num(mysqlPostulantId);
    if (pid == null) return null;
    let mongoId = postulantByMysqlId.get(pid);
    if (mongoId) return mongoId;
    const userId = userByMysqlId.get(pid);
    if (userId) mongoId = postulantByUserId.get(userId.toString());
    if (mongoId) {
      const doc = await Postulant.findById(mongoId).select("mysqlId").lean();
      if (doc && doc.mysqlId == null) {
        await Postulant.updateOne({ _id: mongoId }, { $set: { mysqlId: pid } });
        postulantByMysqlId.set(pid, mongoId);
      }
      return mongoId;
    }
    if (userId) {
      const created = await Postulant.create({
        postulantId: userId,
        mysqlId: pid,
        alternateEmail: "",
      });
      postulantByMysqlId.set(pid, created._id);
      postulantByUserId.set(created.postulantId.toString(), created._id);
      stats.postulantCreatedForProfile += 1;
      return created._id;
    }
    return null;
  };

  // --- 2. Postulant_profile (por lotes). Tabla según tenant-1.sql línea 2045: `postulant_profile` ---
  const countResultProfile = await runQuery(`SELECT COUNT(*) as c FROM \`${MYSQL_TABLE_POSTULANT_PROFILE}\``);
  const totalProfileRowsMysql = countResultProfile?.[0]?.c != null ? Number(countResultProfile[0].c) : 0;
  console.log(`   📋 Tabla MySQL: \`${MYSQL_TABLE_POSTULANT_PROFILE}\` (${totalProfileRowsMysql} filas)`);

  // Idempotencia por mysqlId: no insertar si ya existe un perfil con ese mysqlId (id de MySQL).
  const existingProfilesInMongo = await PostulantProfile.find({}).select("mysqlId").lean();
  const existingProfileMysqlIds = new Set(
    existingProfilesInMongo.map((p) => p.mysqlId).filter((id) => id != null && id !== "")
  );
  const profileByMysqlId = new Map(
    (await PostulantProfile.find({ mysqlId: { $exists: true, $ne: null } }).select("mysqlId _id").lean()).map((p) => [p.mysqlId, p._id])
  );
  console.log(`   📋 PostulantProfile en MongoDB (antes): ${existingProfilesInMongo.length} documentos (trazabilidad por mysqlIds: ${existingProfileMysqlIds.size})`);

  const forceMigrateProfiles = process.env.FORCE_MIGRATE_PROFILES === "1" || process.env.FORCE_MIGRATE_PROFILES === "true";
  if (forceMigrateProfiles && existingProfileMysqlIds.size > 0) {
    console.log("   🔄 FORCE_MIGRATE_PROFILES=1: se eliminan perfiles existentes en MongoDB para re-migrar desde MySQL...");
    const deleted = await PostulantProfile.deleteMany({});
    console.log(`   🗑️  Eliminados: ${deleted.deletedCount} documentos de postulant_profiles`);
    existingProfileMysqlIds.clear();
    profileByMysqlId.clear();
  }

  let lastProfileId = 0;
  while (true) {
    const profileRows = await runQuery(
      `SELECT id, postulant_id, student_code, academic_user, academic_id, degree_option, emphasis, years_experience, filled, last_time_experience, total_time_experience, accept_terms, cv_video_link, profile_text, skills_technical_software, condition_discapacity, level_job, other_studies, possibility_fly, salary_range_min, salary_range_max, retired, employee, independent, have_business, company_name, company_sector, web_site_company, date_creation, user_creator, date_update, user_updater FROM \`${MYSQL_TABLE_POSTULANT_PROFILE}\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastProfileId]
    );
    if (!profileRows || profileRows.length === 0) break;
    const toInsert = [];
    for (const r of profileRows) {
      const profileIdMysql = num(r.id);
      if (profileIdMysql != null) lastProfileId = profileIdMysql;
      let postulantIdMongo = postulantByMysqlId.get(num(r.postulant_id));
      if (!postulantIdMongo) {
        postulantIdMongo = await resolvePostulantIdForProfile(r.postulant_id);
      }
      if (!postulantIdMongo) {
        stats.skippedProfileNoPostulant += 1;
        if (profileIdMysql != null) lastProfileId = profileIdMysql;
        continue;
      }
      if (profileIdMysql == null || existingProfileMysqlIds.has(profileIdMysql)) {
        if (existingProfileMysqlIds.has(profileIdMysql)) stats.skippedProfileAlreadyExists += 1;
        continue;
      }
      toInsert.push({
        postulantId: postulantIdMongo,
        mysqlId: profileIdMysql,
        studentCode: str(r.student_code) || "",
        academicUser: str(r.academic_user),
        academicId: num(r.academic_id),
        degreeOption: str(r.degree_option),
        emphasis: str(r.emphasis),
        yearsExperience: num(r.years_experience),
        filled: bool(r.filled),
        lastTimeExperience: num(r.last_time_experience) ?? 0,
        totalTimeExperience: num(r.total_time_experience) ?? 0,
        acceptTerms: bool(r.accept_terms),
        cvVideoLink: str(r.cv_video_link),
        profileText: str(r.profile_text),
        skillsTechnicalSoftware: str(r.skills_technical_software),
        conditionDiscapacity: bool(r.condition_discapacity),
        levelJob: itemByMysqlId.get(num(r.level_job)) ?? null,
        otherStudies: str(r.other_studies),
        possibilityFly: bool(r.possibility_fly),
        salaryRangeMin: num(r.salary_range_min),
        salaryRangeMax: num(r.salary_range_max),
        retired: bool(r.retired),
        employee: bool(r.employee),
        independent: bool(r.independent),
        haveBusiness: bool(r.have_business),
        companyName: str(r.company_name),
        companySector: itemByMysqlId.get(num(r.company_sector)) ?? null,
        webSiteCompany: str(r.web_site_company),
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      existingProfileMysqlIds.add(profileIdMysql);
    }
    if (toInsert.length > 0) {
      const inserted = await PostulantProfile.insertMany(toInsert);
      inserted.forEach((d) => profileByMysqlId.set(d.mysqlId, d._id));
      stats.postulant_profile += toInsert.length;
      console.log(`   📦 Postulant_profile: lote ${toInsert.length} (total: ${stats.postulant_profile})`);
    }
  }
  if (stats.postulant_profile === 0 && totalProfileRowsMysql > 0) {
    console.warn(`   ⚠️  Postulant_profile: 0 insertados pero MySQL tiene ${totalProfileRowsMysql} filas.`);
    console.warn(`       Sin postulante en Mongo: ${stats.skippedProfileNoPostulant}, ya existían (mysqlId): ${stats.skippedProfileAlreadyExists}`);
    console.warn(`       Si la colección postulant_profiles debe estar vacía, ejecuta: FORCE_MIGRATE_PROFILES=1 node src/seeders/migratePostulantsFromMySQL.js`);
  }
  if (stats.skippedProfileAlreadyExists > 0) {
    console.log(`   ⏭️  Perfiles omitidos (ya en MongoDB): ${stats.skippedProfileAlreadyExists}`);
  }
  console.log(`   ✅ Postulant_profile: ${stats.postulant_profile} creados\n`);

  /** Resuelve id MySQL (profile.id) → _id MongoDB. Trazabilidad: profile_* usan profile_id MySQL, en Mongo guardamos ObjectId. */
  const toProfileId = (mysqlProfileId) => profileByMysqlId.get(num(mysqlProfileId)) ?? null;

  // --- 3. Profile_enrolled_program (por lotes, antes que profile_program_extra_info) ---
  let existingEnrolledIds = new Set(
    (await ProfileEnrolledProgram.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  const enrolledProgramByMysqlId = new Map(
    (await ProfileEnrolledProgram.find({ mysqlId: { $exists: true, $ne: null } }).select("mysqlId _id").lean()).map((p) => [p.mysqlId, p._id])
  );
  let lastEnrolledId = 0;
  while (true) {
    const enrolledRows = await runQuery(
      `SELECT id, profile_id, program_id, program_faculty_id, university, another_university, country_id, state_id, city_id, date_creation, user_creator, date_update, user_updater FROM \`profile_enrolled_program\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastEnrolledId]
    );
    if (!enrolledRows || enrolledRows.length === 0) break;
    const toInsert = [];
    for (const r of enrolledRows) {
      const mysqlId = num(r.id);
      if (mysqlId != null) lastEnrolledId = mysqlId;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (mysqlId != null && existingEnrolledIds.has(mysqlId)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mysqlId ?? undefined,
        programId: programByMysqlId.get(num(r.program_id)) ?? null,
        programFacultyId: programFacultyByMysqlId.get(num(r.program_faculty_id)) ?? null,
        university: itemByMysqlId.get(num(r.university)) ?? null,
        anotherUniversity: str(r.another_university),
        countryId: countryByMysqlId.get(num(r.country_id)) ?? null,
        stateId: stateByMysqlId.get(num(r.state_id)) ?? null,
        cityId: cityByMysqlId.get(num(r.city_id)) ?? null,
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mysqlId != null) existingEnrolledIds.add(mysqlId);
    }
    if (toInsert.length > 0) {
      const inserted = await ProfileEnrolledProgram.insertMany(toInsert);
      inserted.forEach((d) => d.mysqlId != null && enrolledProgramByMysqlId.set(d.mysqlId, d._id));
      stats.profile_enrolled_program += toInsert.length;
    }
  }
  console.log(`   ✅ profile_enrolled_program: ${stats.profile_enrolled_program}`);

  // --- 4. Profile_graduate_program (por lotes) ---
  let existingGradIds = new Set(
    (await ProfileGraduateProgram.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastGradId = 0;
  while (true) {
    const gradRows = await runQuery(
      `SELECT id, profile_id, program_id, program_faculty_id, title, endDate, university, another_university, country_id, state_id, city_id FROM \`profile_graduate_program\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastGradId]
    );
    if (!gradRows || gradRows.length === 0) break;
    const toInsert = [];
    for (const r of gradRows) {
      const mid = num(r.id);
      if (mid != null) lastGradId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingGradIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        programId: programByMysqlId.get(num(r.program_id)) ?? null,
        programFacultyId: programFacultyByMysqlId.get(num(r.program_faculty_id)) ?? null,
        title: str(r.title),
        endDate: date(r.endDate),
        university: itemByMysqlId.get(num(r.university)) ?? null,
        anotherUniversity: str(r.another_university),
        countryId: countryByMysqlId.get(num(r.country_id)) ?? null,
        stateId: stateByMysqlId.get(num(r.state_id)) ?? null,
        cityId: cityByMysqlId.get(num(r.city_id)) ?? null,
      });
      if (mid != null) existingGradIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileGraduateProgram.insertMany(toInsert);
      stats.profile_graduate_program += toInsert.length;
    }
  }
  console.log(`   ✅ profile_graduate_program: ${stats.profile_graduate_program}`);

  // --- 5. Profile_program_extra_info (por lotes) ---
  let existingExtraIds = new Set(
    (await ProfileProgramExtraInfo.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastExtraId = 0;
  while (true) {
    const extraRows = await runQuery(
      `SELECT id, enrolled_program_id, according_credit_semester, enrolled, approved_courses, current_courses, approved_credits, can_practice, cumulative_average, disciplinary_suspension, total_credits, taken_courses, current_practices_credits, approved_practices_credits, current_required_credits, approved_required_credits, current_essencial_credits, approved_essencial_credits, current_elective_credits, approved_elective_credits, current_elective_hm_credits, approved_elective_hm_credits, current_comp_credits, approved_comp_credits, avg_taken_credits, avg_approved_credits, total_required_credits, current_credits, last_update_info, date_creation, user_creator, date_update, user_updater FROM \`profile_program_extra_info\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastExtraId]
    );
    if (!extraRows || extraRows.length === 0) break;
    const toInsert = [];
    for (const r of extraRows) {
      const mid = num(r.id);
      if (mid != null) lastExtraId = mid;
      const enrolledId = enrolledProgramByMysqlId.get(num(r.enrolled_program_id));
      if (!enrolledId) continue;
      if (existingExtraIds.has(mid)) continue;
      toInsert.push({
        enrolledProgramId: enrolledId,
        mysqlId: mid ?? undefined,
        accordingCreditSemester: num(r.according_credit_semester),
        enrolled: bool(r.enrolled),
        approvedCourses: str(r.approved_courses),
        currentCourses: str(r.current_courses),
        approvedCredits: str(r.approved_credits),
        canPractice: bool(r.can_practice),
        cumulativeAverage: num(r.cumulative_average),
        disciplinarySuspension: bool(r.disciplinary_suspension),
        totalCredits: num(r.total_credits),
        takenCourses: str(r.taken_courses),
        currentPracticesCredits: num(r.current_practices_credits),
        approvedPracticesCredits: num(r.approved_practices_credits),
        currentRequiredCredits: num(r.current_required_credits),
        approvedRequiredCredits: num(r.approved_required_credits),
        currentEssencialCredits: num(r.current_essencial_credits),
        approvedEssencialCredits: num(r.approved_essencial_credits),
        currentElectiveCredits: num(r.current_elective_credits),
        approvedElectiveCredits: num(r.approved_elective_credits),
        currentElectiveHmCredits: num(r.current_elective_hm_credits),
        approvedElectiveHmCredits: num(r.approved_elective_hm_credits),
        currentCompCredits: num(r.current_comp_credits),
        approvedCompCredits: num(r.approved_comp_credits),
        avgTakenCredits: num(r.avg_taken_credits),
        avgApprovedCredits: num(r.avg_approved_credits),
        totalRequiredCredits: num(r.total_required_credits),
        currentCredits: num(r.current_credits),
        lastUpdateInfo: date(r.last_update_info),
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingExtraIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileProgramExtraInfo.insertMany(toInsert);
      stats.profile_program_extra_info += toInsert.length;
    }
  }
  console.log(`   ✅ profile_program_extra_info: ${stats.profile_program_extra_info}`);

  // --- 6. Profile_awards (por lotes) ---
  let existingAwardIds = new Set(
    (await ProfileAward.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastAwardId = 0;
  while (true) {
    const awardRows = await runQuery(
      `SELECT id, profile_id, award_type, description, name, award_date, date_creation, user_creator, date_update, user_updater FROM \`profile_awards\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastAwardId]
    );
    if (!awardRows || awardRows.length === 0) break;
    const toInsert = [];
    for (const r of awardRows) {
      const mid = num(r.id);
      if (mid != null) lastAwardId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingAwardIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        awardType: itemByMysqlId.get(num(r.award_type)) ?? null,
        description: str(r.description),
        name: str(r.name) || "",
        awardDate: date(r.award_date),
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingAwardIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileAward.insertMany(toInsert);
      stats.profile_awards += toInsert.length;
    }
  }
  console.log(`   ✅ profile_awards: ${stats.profile_awards}`);

  // --- 7. Profile_cv (sin id en MySQL: batch por OFFSET, Set para existentes) ---
  const existingCvKeys = new Set(
    (await ProfileCv.find({}).select("profileId attachmentId").lean()).map((r) => `${r.profileId}-${r.attachmentId}`)
  );
  let cvOffset = 0;
  while (true) {
    const cvRows = await runQuery(`SELECT profile_id, attachment_id FROM \`profile_cv\` LIMIT ${BATCH_SIZE} OFFSET ${cvOffset}`);
    if (!cvRows || cvRows.length === 0) break;
    cvOffset += cvRows.length;
    const toInsert = [];
    for (const r of cvRows) {
      const pid = toProfileId(r.profile_id);
      const attId = attachmentByMysqlId.get(num(r.attachment_id));
      if (!pid || !attId) continue;
      const key = `${pid}-${attId}`;
      if (existingCvKeys.has(key)) continue;
      existingCvKeys.add(key);
      toInsert.push({ profileId: pid, attachmentId: attId });
    }
    if (toInsert.length > 0) {
      await ProfileCv.insertMany(toInsert);
      stats.profile_cv += toInsert.length;
    }
  }
  console.log(`   ✅ profile_cv: ${stats.profile_cv}`);

  // --- 8. Profile_supports (batch por OFFSET) ---
  const existingSupKeys = new Set(
    (await ProfileSupport.find({}).select("profileId attachmentId").lean()).map((r) => `${r.profileId}-${r.attachmentId}`)
  );
  let supOffset = 0;
  while (true) {
    const supRows = await runQuery(`SELECT profile_id, attachment_id FROM \`profile_supports\` LIMIT ${BATCH_SIZE} OFFSET ${supOffset}`);
    if (!supRows || supRows.length === 0) break;
    supOffset += supRows.length;
    const toInsert = [];
    for (const r of supRows) {
      const pid = toProfileId(r.profile_id);
      const attId = attachmentByMysqlId.get(num(r.attachment_id));
      if (!pid || !attId) continue;
      const key = `${pid}-${attId}`;
      if (existingSupKeys.has(key)) continue;
      existingSupKeys.add(key);
      toInsert.push({ profileId: pid, attachmentId: attId });
    }
    if (toInsert.length > 0) {
      await ProfileSupport.insertMany(toInsert);
      stats.profile_supports += toInsert.length;
    }
  }
  console.log(`   ✅ profile_supports: ${stats.profile_supports}`);

  // --- 9. Profile_info_permissions (batch por OFFSET, sin id) ---
  const existingPermKeys = new Set(
    (await ProfileInfoPermission.find({}).select("profileId permission").lean()).map((r) => `${r.profileId}-${r.permission || ""}`)
  );
  let permOffset = 0;
  while (true) {
    const permRows = await runQuery(`SELECT profile_id, permission FROM \`profile_info_permissions\` LIMIT ${BATCH_SIZE} OFFSET ${permOffset}`);
    if (!permRows || permRows.length === 0) break;
    permOffset += permRows.length;
    const toInsert = [];
    for (const r of permRows) {
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      const perm = str(r.permission);
      const key = `${pid}-${perm}`;
      if (existingPermKeys.has(key)) continue;
      existingPermKeys.add(key);
      toInsert.push({ profileId: pid, permission: perm });
    }
    if (toInsert.length > 0) {
      await ProfileInfoPermission.insertMany(toInsert);
      stats.profile_info_permissions += toInsert.length;
    }
  }
  console.log(`   ✅ profile_info_permissions: ${stats.profile_info_permissions}`);

  // --- 10. Profile_interest_areas (por lotes) ---
  let existingAreaIds = new Set(
    (await ProfileInterestArea.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastAreaId = 0;
  while (true) {
    const areaRows = await runQuery(
      `SELECT id, profile_id, area, date_creation, user_creator, date_update, user_updater FROM \`profile_interest_areas\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastAreaId]
    );
    if (!areaRows || areaRows.length === 0) break;
    const toInsert = [];
    for (const r of areaRows) {
      const mid = num(r.id);
      if (mid != null) lastAreaId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingAreaIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        area: itemByMysqlId.get(num(r.area)) ?? null,
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingAreaIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileInterestArea.insertMany(toInsert);
      stats.profile_interest_areas += toInsert.length;
    }
  }
  console.log(`   ✅ profile_interest_areas: ${stats.profile_interest_areas}`);

  // --- 11. Profile_language (por lotes) ---
  let existingLangIds = new Set(
    (await ProfileLanguage.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastLangId = 0;
  while (true) {
    const langRows = await runQuery(
      `SELECT id, profile_id, language, level, level_write, level_listen, level_read, certification_exam, certification_exam_name, date_creation, user_creator, date_update, user_updater FROM \`profile_language\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastLangId]
    );
    if (!langRows || langRows.length === 0) break;
    const toInsert = [];
    for (const r of langRows) {
      const mid = num(r.id);
      if (mid != null) lastLangId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingLangIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        language: itemByMysqlId.get(num(r.language)) ?? null,
        level: itemByMysqlId.get(num(r.level)) ?? null,
        levelWrite: itemByMysqlId.get(num(r.level_write)) ?? null,
        levelListen: itemByMysqlId.get(num(r.level_listen)) ?? null,
        levelRead: itemByMysqlId.get(num(r.level_read)) ?? null,
        certificationExam: bool(r.certification_exam),
        certificationExamName: str(r.certification_exam_name),
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingLangIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileLanguage.insertMany(toInsert);
      stats.profile_language += toInsert.length;
    }
  }
  console.log(`   ✅ profile_language: ${stats.profile_language}`);

  // --- 12. Profile_other_studies (por lotes) ---
  let existingOtherIds = new Set(
    (await ProfileOtherStudy.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastOtherId = 0;
  while (true) {
    const otherRows = await runQuery(
      `SELECT id, profile_id, study_name, study_institution, study_year, date_creation, user_creator, date_update, user_updater FROM \`profile_other_studies\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastOtherId]
    );
    if (!otherRows || otherRows.length === 0) break;
    const toInsert = [];
    for (const r of otherRows) {
      const mid = num(r.id);
      if (mid != null) lastOtherId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingOtherIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        studyName: str(r.study_name) || "",
        studyInstitution: str(r.study_institution) || "",
        studyYear: num(r.study_year) ?? 0,
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingOtherIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileOtherStudy.insertMany(toInsert);
      stats.profile_other_studies += toInsert.length;
    }
  }
  console.log(`   ✅ profile_other_studies: ${stats.profile_other_studies}`);

  // --- 13. Profile_profile_version (por lotes) ---
  let existingVerIds = new Set(
    (await ProfileProfileVersion.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastVerId = 0;
  while (true) {
    const verRows = await runQuery(
      `SELECT id, profile_id, profile_name, profile_text, date_creation, user_creator, date_update, user_updater FROM \`profile_profile_version\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastVerId]
    );
    if (!verRows || verRows.length === 0) break;
    const toInsert = [];
    for (const r of verRows) {
      const mid = num(r.id);
      if (mid != null) lastVerId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingVerIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        profileName: str(r.profile_name) || "",
        profileText: str(r.profile_text) || "",
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingVerIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileProfileVersion.insertMany(toInsert);
      stats.profile_profile_version += toInsert.length;
    }
  }
  console.log(`   ✅ profile_profile_version: ${stats.profile_profile_version}`);

  // --- 14. Profile_references (por lotes) ---
  let existingRefIds = new Set(
    (await ProfileReference.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastRefId = 0;
  while (true) {
    const refRows = await runQuery(
      `SELECT id, profile_id, firstname, lastname, ocuppation, phone, date_creation, user_creator, date_update, user_updater FROM \`profile_references\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastRefId]
    );
    if (!refRows || refRows.length === 0) break;
    const toInsert = [];
    for (const r of refRows) {
      const mid = num(r.id);
      if (mid != null) lastRefId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingRefIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        firstname: (str(r.firstname) && str(r.firstname).length > 0) ? str(r.firstname) : "N/A",
        lastname: (str(r.lastname) && str(r.lastname).length > 0) ? str(r.lastname) : "N/A",
        occupation: (str(r.ocuppation) && str(r.ocuppation).length > 0) ? str(r.ocuppation) : "N/A",
        phone: (str(r.phone) && str(r.phone).length > 0) ? str(r.phone) : "N/A",
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingRefIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileReference.insertMany(toInsert);
      stats.profile_references += toInsert.length;
    }
  }
  console.log(`   ✅ profile_references: ${stats.profile_references}`);

  // --- 15. Profile_skill (por lotes) ---
  let existingSkillProfileIds = new Set(
    (await ProfileSkill.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastSkillProfileId = 0;
  while (true) {
    const skillProfileRows = await runQuery(
      `SELECT id, profile_id, skill_id, experience_years, date_creation, user_creator, date_update, user_updater FROM \`profile_skill\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastSkillProfileId]
    );
    if (!skillProfileRows || skillProfileRows.length === 0) break;
    const toInsert = [];
    for (const r of skillProfileRows) {
      const mid = num(r.id);
      if (mid != null) lastSkillProfileId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingSkillProfileIds.has(mid)) continue;
      const skillId = skillByMysqlId.get(num(r.skill_id));
      if (!skillId) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        skillId,
        experienceYears: num(r.experience_years) ?? 0,
        dateCreation: date(r.date_creation) || new Date(),
        userCreator: str(r.user_creator) || "migration",
        dateUpdate: date(r.date_update),
        userUpdater: str(r.user_updater),
      });
      if (mid != null) existingSkillProfileIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileSkill.insertMany(toInsert);
      stats.profile_skill += toInsert.length;
    }
  }
  console.log(`   ✅ profile_skill: ${stats.profile_skill}`);

  // --- 16. Profile_work_experiences (por lotes) ---
  let existingWorkIds = new Set(
    (await ProfileWorkExperience.find({}).select("mysqlId").lean()).map((p) => p.mysqlId).filter(Boolean)
  );
  let lastWorkId = 0;
  while (true) {
    const workRows = await runQuery(
      `SELECT id, profile_id, experience_type, profile_text, company_name, company_sector, job_title, profession, contact, achievements, activities, investigation_line, course, country_id, state_id, city_id, start_date, end_date, no_end_date, creation_date, update_date FROM \`profile_work_experiences\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastWorkId]
    );
    if (!workRows || workRows.length === 0) break;
    const toInsert = [];
    for (const r of workRows) {
      const mid = num(r.id);
      if (mid != null) lastWorkId = mid;
      const pid = toProfileId(r.profile_id);
      if (!pid) continue;
      if (existingWorkIds.has(mid)) continue;
      toInsert.push({
        profileId: pid,
        mysqlId: mid ?? undefined,
        experienceType: str(r.experience_type) || "JOB_EXP",
        profileText: str(r.profile_text),
        companyName: str(r.company_name),
        companySector: itemByMysqlId.get(num(r.company_sector)) ?? null,
        jobTitle: str(r.job_title),
        profession: str(r.profession),
        contact: str(r.contact),
        achievements: str(r.achievements),
        activities: str(r.activities),
        investigationLine: str(r.investigation_line),
        course: str(r.course),
        countryId: countryByMysqlId.get(num(r.country_id)) ?? null,
        stateId: stateByMysqlId.get(num(r.state_id)) ?? null,
        cityId: cityByMysqlId.get(num(r.city_id)) ?? null,
        startDate: date(r.start_date),
        endDate: date(r.end_date),
        noEndDate: bool(r.no_end_date),
        creationDate: date(r.creation_date) || new Date(),
        updateDate: date(r.update_date),
      });
      if (mid != null) existingWorkIds.add(mid);
    }
    if (toInsert.length > 0) {
      await ProfileWorkExperience.insertMany(toInsert);
      stats.profile_work_experiences += toInsert.length;
    }
  }
  console.log(`   ✅ profile_work_experiences: ${stats.profile_work_experiences}`);

  console.log("\n🎉 Resumen migración postulantes:");
  console.log(`   postulant: ${stats.postulant} creados (omitidos sin usuario: ${stats.skippedPostulantNoUser}, ya existían: ${stats.skippedPostulantAlreadyExists})`);
  if (stats.postulantCreatedForProfile > 0) {
    console.log(`   postulant (creados por perfil): ${stats.postulantCreatedForProfile}`);
  }
  console.log(`   postulant_profile: ${stats.postulant_profile}`);
  if (stats.skippedProfileNoPostulant > 0 || stats.skippedProfileAlreadyExists > 0) {
    console.log(`   ⏭️  Perfiles omitidos: sin postulante ${stats.skippedProfileNoPostulant}, ya en MongoDB ${stats.skippedProfileAlreadyExists}`);
  }
  console.log(`   profile_*: ${stats.profile_awards + stats.profile_cv + stats.profile_enrolled_program + stats.profile_graduate_program + stats.profile_info_permissions + stats.profile_interest_areas + stats.profile_language + stats.profile_other_studies + stats.profile_profile_version + stats.profile_program_extra_info + stats.profile_references + stats.profile_skill + stats.profile_supports + stats.profile_work_experiences}`);
  if (stats.skippedPostulantNoUser > 0) {
    console.log("\n💡 Para migrar todos los postulantes, ejecuta primero: npm run migrate:users");
    console.log("   Eso rellenará User.mysqlId (y crea usuarios faltantes en Mongo) para que postulant_id coincida.");
  }
  if (stats.skippedProfileNoPostulant > 0) {
    console.log("\n💡 Perfiles omitidos: el postulant_id en MySQL no tiene usuario en MongoDB. Ejecuta migrate:users y vuelve a ejecutar esta migración.");
  }

  await closePool();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Error en migración:", err);
  process.exit(1);
});
