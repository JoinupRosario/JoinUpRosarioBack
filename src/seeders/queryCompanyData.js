import dotenv from "dotenv";
import connectMySQL, { query, closePool } from "../config/mysql.js";

dotenv.config();

const queryCompanyData = async (companyId = null) => {
  try {
    console.log('🔍 Consultando datos de empresas...');
    await connectMySQL();
    
    // Si se proporciona un ID específico, consultar solo esa empresa
    const whereClause = companyId ? `WHERE c.id = ${companyId}` : '';
    
    // Consulta principal de la empresa con todas las relaciones
    const sql = `
      SELECT 
        c.id,
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
        city.name AS city_name,
        -- Logo y documentos (solo IDs por ahora)
        c.logo_id,
        c.chamber_commerce_cert,
        c.rut,
        c.agency_head_hunter_cert
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
      ${whereClause}
      ORDER BY c.id
      LIMIT 5
    `;
    
    const companies = await query(sql);
    
    console.log(`\n📊 Se encontraron ${companies.length} empresas\n`);
    
    // Para cada empresa, obtener datos relacionados
    for (const company of companies) {
      console.log(`\n🏢 Empresa ID: ${company.id}`);
      console.log(`   Nombre Comercial: ${company.trade_name || 'N/A'}`);
      console.log(`   Razón Social: ${company.business_name || 'N/A'}`);
      console.log(`   NIT: ${company.identification_number}`);
      console.log(`   Sector: ${company.sector_value || 'N/A'}`);
      console.log(`   Sector SNIES: ${company.snies_sector_value || 'N/A'}`);
      console.log(`   Sector Económico: ${company.business_sector_value || 'N/A'}`);
      console.log(`   Tamaño: ${company.size_value || 'N/A'}`);
      console.log(`   ARL: ${company.arl_value || 'N/A'}`);
      console.log(`   País: ${company.country_name || 'N/A'}`);
      console.log(`   Ciudad: ${company.city_name || 'N/A'}`);
      console.log(`   Estado: ${company.status}`);
      
      // Consultar oficinas (branches)
      const officesSql = `
        SELECT 
          co.id,
          co.name,
          co.address,
          co.phone,
          co.dominio,
          country.name AS country_name,
          city.name AS city_name
        FROM company_office co
        LEFT JOIN country ON co.country = country.id
        LEFT JOIN city ON co.city = city.id
        WHERE co.company = ?
      `;
      const offices = await query(officesSql, [company.id]);
      console.log(`   📍 Oficinas: ${offices.length}`);
      offices.forEach(office => {
        console.log(`      - ${office.name} (${office.city_name || 'N/A'})`);
      });
      
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
          country.name AS country_name,
          city.name AS city_name,
          u.name AS user_name,
          u.last_name AS user_last_name,
          u.user_name AS user_email,
          u.personal_email,
          u.movil
        FROM company_user cu
        LEFT JOIN user u ON cu.company_user_id = u.id
        LEFT JOIN country ON cu.country = country.id
        LEFT JOIN city ON cu.city = city.id
        WHERE cu.company_id = ?
      `;
      const users = await query(usersSql, [company.id]);
      console.log(`   👥 Usuarios: ${users.length}`);
      users.forEach(user => {
        console.log(`      - ${user.user_name || 'N/A'} ${user.user_last_name || ''} (${user.user_email || user.cmp_alternate_email || 'N/A'}) - ${user.position || 'N/A'}`);
      });
      
      // Consultar documentos
      const documentsSql = `
        SELECT 
          cd.id,
          cd.name,
          cd.aggrement_code,
          cd.agg_start_date,
          cd.agg_end_date,
          doc_type_item.value AS document_type_value,
          agg_type_item.value AS aggrement_type_value
        FROM company_document cd
        LEFT JOIN item doc_type_item ON cd.document_type = doc_type_item.id
        LEFT JOIN item agg_type_item ON cd.aggrement_type = agg_type_item.id
        WHERE cd.company_id = ?
      `;
      const documents = await query(documentsSql, [company.id]);
      console.log(`   📄 Documentos: ${documents.length}`);
      documents.forEach(doc => {
        console.log(`      - ${doc.name} (${doc.document_type_value || 'N/A'})`);
      });
    }
    
    console.log('\n✅ Consulta completada!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al consultar empresas:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
};

// Obtener ID de empresa desde argumentos de línea de comandos
const companyId = process.argv[2] ? parseInt(process.argv[2]) : null;
queryCompanyData(companyId);
