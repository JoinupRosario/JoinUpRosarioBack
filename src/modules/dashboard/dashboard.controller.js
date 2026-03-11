import Postulant from "../postulants/models/postulants.schema.js";
import Company from "../companies/company.model.js";
import Opportunity from "../opportunities/opportunity.model.js";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CANTIDAD_MESES_GRAFICO = 6;

/**
 * GET /dashboard/stats
 * Devuelve conteos reales y datos de postulaciones para el dashboard:
 * - totalStudents, registeredCompanies, availableOpportunities
 * - applicationsByMonth: postulaciones reales por mes (últimos N meses)
 * - applicationTrends: misma serie para el gráfico de tendencia
 */
export const getDashboardStats = async (req, res) => {
  try {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - CANTIDAD_MESES_GRAFICO);
    desde.setHours(0, 0, 0, 0);

    const [totalStudents, registeredCompanies, availableOpportunities, postulacionesPorMes] =
      await Promise.all([
        Postulant.countDocuments({}),
        Company.countDocuments({}),
        Opportunity.countDocuments({ estado: "Activa" }),
        PostulacionOportunidad.aggregate([
          { $match: { createdAt: { $gte: desde } } },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
      ]);

    const hoy = new Date();
    const aplicacionesPorMes = [];
    for (let i = CANTIDAD_MESES_GRAFICO - 1; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const item = postulacionesPorMes.find(
        (p) => p._id.year === year && p._id.month === month
      );
      aplicacionesPorMes.push({
        label: MESES[d.getMonth()],
        value: item ? item.count : 0,
      });
    }

    return res.json({
      totalStudents,
      registeredCompanies,
      availableOpportunities,
      applicationsByMonth: aplicacionesPorMes,
      applicationTrends: aplicacionesPorMes,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
