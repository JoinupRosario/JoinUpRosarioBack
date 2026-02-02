import dotenv from "dotenv";
import connectDB from "../config/db.js";
import connectMySQL, { query, closePool } from "../config/mysql.js";
import Company from "../modules/companies/company.model.js";
import User from "../modules/users/user.model.js";
import Country from "../modules/shared/location/models/country.schema.js";
import City from "../modules/shared/location/models/city.schema.js";
import bcrypt from "bcryptjs";

dotenv.config();

const migrateCompaniesFromMySQL = async () => {
  try {
    console.log('🔄 Iniciando migración de empresas desde MySQL a MongoDB...');
    
    await connectDB();
    await connectMySQL();
    
    // Consultar todas las empresas con sus relaciones
    const companiesSql = `
      SELECT 
        c.id AS mysql_id,
        c.trade_name,
        c.business_name,
        c.identification_number,
        c.address,
        c.phone_number,
        c.ciiu_code,
        c.description,
        c.authorize_logo_usage,
        c.want_practice_aggrement,
        c.web,
        c.dominio,
        c.linkedin,
        c.facebook,
        c.twitter,
        c.instagram,
        c.lr_firstname,
        c.lr_lastname,
        c.lr_identification,
        c.lr_email,
        c.reps_code,
        c.conaces_agg_code,
        c.conaces_agg_start_date,
        c.conaces_agg_end_date,
        c.conaces_agg_quota,
        c.is_agency_head_hunter,
        c.program_ids,
        c.status,
        c.user_creator,
        c.date_creation,
        c.user_updated,
        c.date_update,
        c.can_create_offer,
        c.logo_id,
        c.chamber_commerce_cert,
        c.rut,
        c.agency_head_hunter_cert,
        -- Relaciones con item (valores de texto)
        sector_item.value AS sector_value,
        snies_item.value AS snies_sector_value,
        size_item.value AS size_value,
        arl_item.value AS arl_value,
        business_sector_item.value AS business_sector_value,
        id_type_item.value AS identification_type_value,
        lr_id_type_item.value AS lr_identification_type_value,
        -- Relaciones con country y city
        country.name AS country_name,
        country.sortname AS country_code,
        city.name AS city_name,
        state.name AS state_name,
        state.dian_code AS state_code
      FROM company c
      LEFT JOIN item sector_item ON c.sector = sector_item.id
      LEFT JOIN item snies_item ON c.snies_sector = snies_item.id
      LEFT JOIN item size_item ON c.size = size_item.id
      LEFT JOIN item arl_item ON c.arl = arl_item.id
      LEFT JOIN item business_sector_item ON c.business_sector = business_sector_item.id
      LEFT JOIN item id_type_item ON c.identification_type = id_type_item.id
      LEFT JOIN item lr_id_type_item ON c.lr_identification_type = lr_id_type_item.id
      LEFT JOIN country ON c.country = country.id
      LEFT JOIN city ON c.city = city.id
      LEFT JOIN state ON city.state_id = state.id
      ORDER BY c.id
    `;
    
    const companies = await query(companiesSql);
    console.log(`📊 Se encontraron ${companies.length} empresas para migrar\n`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const mysqlCompany of companies) {
      try {
        // Verificar si ya existe
        const existing = await Company.findOne({ 
          $or: [
            { nit: mysqlCompany.identification_number },
            { idNumber: mysqlCompany.identification_number }
          ]
        });
        
        if (existing) {
          console.log(`⏭️  Empresa ${mysqlCompany.mysql_id} (${mysqlCompany.business_name || mysqlCompany.trade_name}) ya existe, omitiendo...`);
          skipped++;
          continue;
        }
        
        // Mapear tamaño
        const mapSize = (sizeValue) => {
          if (!sizeValue) return 'mediana';
          const lower = sizeValue.toLowerCase();
          if (lower.includes('menor') || lower.includes('micro')) return 'micro';
          if (lower.includes('pequeña') || lower.includes('pequena')) return 'pequeña';
          if (lower.includes('grande') || lower.includes('superior')) return 'grande';
          return 'mediana';
        };
        
        // Mapear tipo de identificación
        const mapIdType = (idTypeValue) => {
          if (!idTypeValue) return 'NIT';
          const upper = idTypeValue.toUpperCase();
          if (upper.includes('NIT')) return 'NIT';
          if (upper.includes('CC') || upper.includes('CEDULA')) return 'CC';
          if (upper.includes('CE')) return 'CE';
          if (upper.includes('PASAPORTE') || upper.includes('PASSPORT')) return 'PASAPORTE';
          return 'OTRO';
        };
        
        // Mapear estado
        const mapStatus = (status) => {
          if (!status) return 'pending_approval';
          const upper = status.toUpperCase();
          if (upper === 'ACTIVE' || upper === 'ACTIVO') return 'active';
          if (upper === 'INACTIVE' || upper === 'INACTIVO') return 'inactive';
          return 'pending_approval';
        };
        
        // Consultar oficinas (branches)
        const officesSql = `
          SELECT 
            co.name,
            co.address,
            co.phone,
            co.dominio,
            country.name AS country_name,
            country.sortname AS country_code,
            city.name AS city_name,
            state.name AS state_name,
            state.dian_code AS state_code
          FROM company_office co
          LEFT JOIN country ON co.country = country.id
          LEFT JOIN city ON co.city = city.id
          LEFT JOIN state ON city.state_id = state.id
          WHERE co.company = ?
        `;
        const offices = await query(officesSql, [mysqlCompany.mysql_id]);
        
        // Consultar usuarios (contacts)
        const usersSql = `
          SELECT 
            cu.company_user_id,
            cu.position,
            cu.principal,
            cu.dependence,
            cu.phone,
            cu.extent,
            cu.cmp_alternate_email,
            cu.address,
            cu.is_tutor,
            country.id AS country_mysql_id,
            country.name AS country_name,
            city.id AS city_mysql_id,
            city.name AS city_name,
            u.name AS user_name,
            u.last_name AS user_last_name,
            u.user_name AS user_email,
            u.personal_email,
            u.movil,
            u.identification
          FROM company_user cu
          LEFT JOIN user u ON cu.company_user_id = u.id
          LEFT JOIN country ON cu.country = country.id
          LEFT JOIN city ON cu.city = city.id
          WHERE cu.company_id = ?
        `;
        const users = await query(usersSql, [mysqlCompany.mysql_id]);
        
        // Crear mapa de mysqlCountryId y mysqlCityId a ObjectId de MongoDB
        const countryMongoMap = new Map();
        const cityMongoMap = new Map();
        
        if (mysqlCompany.country) {
          const countryMongo = await Country.findOne({ mysqlId: mysqlCompany.country });
          if (countryMongo) countryMongoMap.set(mysqlCompany.country, countryMongo._id);
        }
        
        if (mysqlCompany.city) {
          const cityMongo = await City.findOne({ mysqlId: mysqlCompany.city });
          if (cityMongo) cityMongoMap.set(mysqlCompany.city, cityMongo._id);
        }
        
        // Construir objeto para MongoDB
        const mongoCompany = {
          // ID de MySQL para referencia
          mysqlId: mysqlCompany.mysql_id,
          
          // Identificación y nombres
          name: mysqlCompany.business_name || mysqlCompany.trade_name || '',
          legalName: mysqlCompany.business_name || null,
          commercialName: mysqlCompany.trade_name || null,
          idType: mapIdType(mysqlCompany.identification_type_value),
          idNumber: mysqlCompany.identification_number || '',
          nit: mysqlCompany.identification_number || null,
          
          // Clasificaciones
          sector: mysqlCompany.sector_value || null,
          sectorMineSnies: mysqlCompany.snies_sector_value || null,
          economicSector: mysqlCompany.business_sector_value || null,
          ciiuCode: mysqlCompany.ciiu_code || null,
          size: mapSize(mysqlCompany.size_value),
          arl: mysqlCompany.arl_value || null,
          
          // Contacto y ubicación - usar ObjectId de MongoDB para country y city
          address: mysqlCompany.address || null,
          city: mysqlCompany.city_name || null, // Mantener nombre para referencia
          country: mysqlCompany.country_name || 'Colombia', // Mantener nombre para referencia
          countryCode: mysqlCompany.country_code || null,
          state: mysqlCompany.state_name || null,
          stateCode: mysqlCompany.state_code || null,
          phone: mysqlCompany.phone_number || null,
          email: mysqlCompany.lr_email || null, // Email del representante legal
          website: mysqlCompany.web || null,
          domain: mysqlCompany.dominio || null,
          linkedinUrl: mysqlCompany.linkedin || null,
          
          // Contenidos
          description: mysqlCompany.description || null,
          missionVision: null, // No existe en MySQL
          
          // Logo y permisos
          logo: mysqlCompany.logo_id ? mysqlCompany.logo_id.toString() : null,
          authorizeLogoUsage: mysqlCompany.authorize_logo_usage === 1 || mysqlCompany.authorize_logo_usage === true,
          
          // Reglas y capacidad
          canCreateOpportunities: mysqlCompany.can_create_offer === 1 || mysqlCompany.can_create_offer === true,
          operatesAsAgency: mysqlCompany.is_agency_head_hunter === 1 || mysqlCompany.is_agency_head_hunter === true,
          wantsPracticeAgreement: mysqlCompany.want_practice_aggrement === 1 || mysqlCompany.want_practice_aggrement === true,
          programsOfInterest: mysqlCompany.program_ids ? 
            mysqlCompany.program_ids.split(',').map(id => ({ program: id.trim() })) : [],
          
          // Documentos básicos
          chamberOfCommerceCertificate: mysqlCompany.chamber_commerce_cert ? 
            mysqlCompany.chamber_commerce_cert.toString() : null,
          rutDocument: mysqlCompany.rut ? mysqlCompany.rut.toString() : null,
          agencyAccreditationDocument: mysqlCompany.agency_head_hunter_cert ? 
            mysqlCompany.agency_head_hunter_cert.toString() : null,
          
          // Contacto principal (legal representative)
          contact: {
            name: mysqlCompany.lr_firstname && mysqlCompany.lr_lastname
              ? `${mysqlCompany.lr_firstname} ${mysqlCompany.lr_lastname}`.trim()
              : null,
            position: null, // No existe en MySQL
            phone: mysqlCompany.phone_number || null,
            email: mysqlCompany.lr_email || null
          },
          legalRepresentative: {
            firstName: mysqlCompany.lr_firstname || null,
            lastName: mysqlCompany.lr_lastname || null,
            email: mysqlCompany.lr_email || null,
            idType: mapIdType(mysqlCompany.lr_identification_type_value),
            idNumber: mysqlCompany.lr_identification || null
          },
          
          // Branches (oficinas)
          branches: offices.map(office => ({
            name: office.name || '',
            address: office.address || '',
            phone: office.phone || '',
            country: office.country_name || null, // Mantener nombre para referencia
            countryCode: office.country_code || null,
            state: office.state_name || null,
            stateCode: office.state_code || null,
            city: office.city_name || null, // Mantener nombre para referencia
            domain: office.dominio || null
          })),
          
          // Contacts (usuarios de la empresa) - crear usuarios para cada contacto
          contacts: await Promise.all(users.map(async (user) => {
            const userEmail = user.user_email || user.cmp_alternate_email || user.personal_email || '';
            const userName = user.user_name || '';
            const userLastName = user.user_last_name || '';
            const fullName = `${userName} ${userLastName}`.trim() || userEmail;
            
            // Crear o buscar usuario en MongoDB
            let mongoUser = await User.findOne({ email: userEmail.toLowerCase() });
            
            if (!mongoUser && userEmail) {
              // Crear nuevo usuario con contraseña genérica
              const genericPassword = 'Generica123#';
              const hashedPassword = await bcrypt.hash(genericPassword, 10);
              
              // Generar código único para el usuario
              const code = `ENT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              mongoUser = await User.create({
                name: fullName,
                email: userEmail.toLowerCase(),
                code: code,
                password: hashedPassword,
                estado: mapStatus(mysqlCompany.status) === 'active',
                modulo: 'entidades',
                debeCambiarPassword: true // Forzar cambio de contraseña al primer login
              });
              
              console.log(`   👤 Usuario creado para contacto: ${fullName} (${userEmail})`);
            }
            
            return {
              userId: mongoUser ? mongoUser._id : null,
              firstName: userName || '',
              lastName: userLastName || '',
              alternateEmail: user.cmp_alternate_email || user.personal_email || null,
              country: user.country_name || null,
              city: user.city_name || null,
              address: user.address || null,
              phone: user.phone || null,
              extension: user.extent || null,
              mobile: user.movil || null,
              idType: 'CC', // Por defecto, se puede mejorar después
              identification: user.identification || null,
              userEmail: userEmail || '',
              dependency: user.dependence || null,
              isPrincipal: user.principal === 1 || user.principal === true,
              position: user.position || null,
              isPracticeTutor: user.is_tutor === 1 || user.is_tutor === true,
              status: mapStatus(mysqlCompany.status) === 'active' ? 'active' : 'inactive'
            };
          })),
          
          // Estado
          status: mapStatus(mysqlCompany.status),
          approvedBy: null, // Se puede mapear después
          approvedAt: null,
          
          // Metadata
          createdAt: mysqlCompany.date_creation || new Date(),
          updatedAt: mysqlCompany.date_update || new Date()
        };
        
        // Crear en MongoDB
        const createdCompany = await Company.create(mongoCompany);
        console.log(`✅ Empresa ${mysqlCompany.mysql_id} migrada: ${createdCompany.name} (MongoDB ID: ${createdCompany._id})`);
        console.log(`   📧 Contactos creados: ${mongoCompany.contacts.filter(c => c.userId).length}`);
        migrated++;
        
      } catch (error) {
        console.error(`❌ Error migrando empresa ${mysqlCompany.mysql_id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n📊 Resumen de migración:`);
    console.log(`   ✅ Migradas: ${migrated}`);
    console.log(`   ⏭️  Omitidas: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`\n🎉 Migración completada!`);
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error en migración:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
};

migrateCompaniesFromMySQL();
