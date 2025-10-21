import User from "../modules/users/user.model.js";
import Parameter from "../modules/parameters/parameter.model.js";
import bcrypt from "bcryptjs";

// Función para crear datos iniciales
export const seedInitialData = async () => {
  try {
    console.log("🌱 Iniciando seeders...");

    // Crear usuario administrador si no existe
    await createAdminUser();
    
    // Crear parámetros del sistema
    await createSystemParameters();
    
    console.log("✅ Seeders completados correctamente");
  } catch (error) {
    console.error("❌ Error en seeders:", error.message);
  }
};

// Crear usuario administrador
const createAdminUser = async () => {
  try {
    const existingAdmin = await User.findOne({ role: "superadmin" });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      
      const admin = await User.create({
        name: "Administrador del Sistema",
        email: "admin@practicas.com",
        password: hashedPassword,
        role: "superadmin",
        active: true
      });
      
      console.log("👤 Usuario administrador creado:", admin.email);
    } else {
      console.log("👤 Usuario administrador ya existe");
    }
  } catch (error) {
    console.error("Error creando usuario administrador:", error.message);
  }
};

// Crear parámetros del sistema
const createSystemParameters = async () => {
  try {
    const parameters = [
      // Facultades
      { category: "faculties", name: "Ingeniería", code: "ING", description: "Facultad de Ingeniería" },
      { category: "faculties", name: "Ciencias Económicas", code: "ECO", description: "Facultad de Ciencias Económicas" },
      { category: "faculties", name: "Ciencias de la Salud", code: "SAL", description: "Facultad de Ciencias de la Salud" },
      { category: "faculties", name: "Ciencias Humanas", code: "HUM", description: "Facultad de Ciencias Humanas" },
      
      // Programas académicos
      { category: "programs", name: "Ingeniería de Sistemas", code: "ISIS", description: "Programa de Ingeniería de Sistemas" },
      { category: "programs", name: "Ingeniería Industrial", code: "IIND", description: "Programa de Ingeniería Industrial" },
      { category: "programs", name: "Administración de Empresas", code: "ADEM", description: "Programa de Administración de Empresas" },
      { category: "programs", name: "Medicina", code: "MED", description: "Programa de Medicina" },
      { category: "programs", name: "Psicología", code: "PSI", description: "Programa de Psicología" },
      
      // Tipos de documento
      { category: "document_types", name: "Cédula de Ciudadanía", code: "CC", description: "Documento de identidad" },
      { category: "document_types", name: "Tarjeta de Identidad", code: "TI", description: "Documento de identidad para menores" },
      { category: "document_types", name: "Cédula de Extranjería", code: "CE", description: "Documento de identidad para extranjeros" },
      { category: "document_types", name: "Pasaporte", code: "PAS", description: "Documento de identidad internacional" },
      
      // Sectores económicos
      { category: "sectors", name: "Tecnología", code: "TEC", description: "Sector de tecnología e informática" },
      { category: "sectors", name: "Salud", code: "SAL", description: "Sector de salud y medicina" },
      { category: "sectors", name: "Finanzas", code: "FIN", description: "Sector financiero y bancario" },
      { category: "sectors", name: "Educación", code: "EDU", description: "Sector educativo" },
      { category: "sectors", name: "Manufactura", code: "MAN", description: "Sector manufacturero" },
      { category: "sectors", name: "Servicios", code: "SER", description: "Sector de servicios" },
      
      // Tamaños de empresa
      { category: "company_sizes", name: "Microempresa", code: "MICRO", description: "1-10 empleados" },
      { category: "company_sizes", name: "Pequeña Empresa", code: "PEQUE", description: "11-50 empleados" },
      { category: "company_sizes", name: "Mediana Empresa", code: "MEDIA", description: "51-200 empleados" },
      { category: "company_sizes", name: "Gran Empresa", code: "GRANDE", description: "Más de 200 empleados" },
      
      // Tipos de pasantía
      { category: "internship_types", name: "Práctica Profesional", code: "PRAC", description: "Práctica profesional obligatoria" },
      { category: "internship_types", name: "Pasantía", code: "PAS", description: "Pasantía opcional" },
      { category: "internship_types", name: "Práctica Social", code: "SOC", description: "Práctica social comunitaria" },
      
      // Criterios de evaluación
      { category: "evaluation_criteria", name: "Puntualidad", code: "PUNT", description: "Evaluación de puntualidad" },
      { category: "evaluation_criteria", name: "Responsabilidad", code: "RESP", description: "Evaluación de responsabilidad" },
      { category: "evaluation_criteria", name: "Conocimientos Técnicos", code: "TEC", description: "Evaluación de conocimientos técnicos" },
      { category: "evaluation_criteria", name: "Trabajo en Equipo", code: "EQUI", description: "Evaluación de trabajo en equipo" },
      { category: "evaluation_criteria", name: "Iniciativa", code: "INIC", description: "Evaluación de iniciativa" }
    ];

    for (const param of parameters) {
      const existing = await Parameter.findOne({ code: param.code });
      if (!existing) {
        await Parameter.create({
          ...param,
          createdBy: (await User.findOne({ role: "superadmin" }))._id,
          metadata: {
            active: true,
            order: 0
          }
        });
      }
    }
    
    console.log("📋 Parámetros del sistema creados");
  } catch (error) {
    console.error("Error creando parámetros:", error.message);
  }
};

// Función para limpiar datos (solo para desarrollo)
export const clearData = async () => {
  try {
    console.log("🧹 Limpiando datos...");
    
    await Parameter.deleteMany({});
    await User.deleteMany({ role: { $ne: "superadmin" } });
    
    console.log("✅ Datos limpiados");
  } catch (error) {
    console.error("❌ Error limpiando datos:", error.message);
  }
};
