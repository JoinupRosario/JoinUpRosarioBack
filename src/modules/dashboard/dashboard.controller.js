import Postulant from "../postulants/models/postulants.schema.js";
import Company from "../companies/company.model.js";
import Opportunity from "../opportunities/opportunity.model.js";

/**
 * GET /dashboard/stats
 * Devuelve conteos reales desde MongoDB para el dashboard:
 * - totalStudents: total de postulantes (estudiantes)
 * - registeredCompanies: total de empresas
 * - availableOpportunities: oportunidades con estado "Activa"
 */
export const getDashboardStats = async (req, res) => {
  try {
    const [totalStudents, registeredCompanies, availableOpportunities] = await Promise.all([
      Postulant.countDocuments({}),
      Company.countDocuments({}),
      Opportunity.countDocuments({ estado: "Activa" }),
    ]);

    return res.json({
      totalStudents,
      registeredCompanies,
      availableOpportunities,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
