import Postulant from "../postulants/models/postulants.schema.js";
import Company from "../companies/company.model.js";
import Opportunity from "../opportunities/opportunity.model.js";
import PostulacionOportunidad from "../opportunities/postulacionOportunidad.model.js";
import OportunidadMTM from "../oportunidadesMTM/oportunidadMTM.model.js";
import PostulacionMTM from "../oportunidadesMTM/postulacionMTM.model.js";
import LegalizacionPractica from "../legalizacionPractica/legalizacionPractica.model.js";
import LegalizacionMTM from "../oportunidadesMTM/legalizacionMTM.model.js";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CANTIDAD_MESES_GRAFICO = 6;

const LABELS_POSTULACION = {
  aplicado: "Aplicado",
  empresa_consulto_perfil: "Empresa consultó perfil",
  empresa_descargo_hv: "HV descargada",
  seleccionado_empresa: "Seleccionado por empresa",
  aceptado_estudiante: "Aceptado por estudiante",
  rechazado: "Rechazado",
};

const LABELS_LEGALIZACION = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  en_ajuste: "En ajuste",
};

/**
 * Agrupa postulaciones por mes usando fecha de aplicación (fallback: createdAt).
 */
async function aggregatePostulacionesPorMes(Model, desde) {
  return Model.aggregate([
    { $addFields: { _appDate: { $ifNull: ["$fechaAplicacion", "$createdAt"] } } },
    { $match: { _appDate: { $gte: desde } } },
    {
      $group: {
        _id: {
          year: { $year: "$_appDate" },
          month: { $month: "$_appDate" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
}

function rellenarUltimosMeses(agg, hoy) {
  const aplicacionesPorMes = [];
  for (let i = CANTIDAD_MESES_GRAFICO - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const item = agg.find((p) => p._id.year === year && p._id.month === month);
    aplicacionesPorMes.push({
      label: MESES[d.getMonth()],
      value: item ? item.count : 0,
    });
  }
  return aplicacionesPorMes;
}

function mapEstadosPie(rows) {
  if (!rows?.length) return [{ label: "Sin datos", value: 0 }];
  return rows.map((r) => ({
    label: r._id != null && r._id !== "" ? String(r._id) : "Sin estado",
    value: r.count,
  }));
}

function mapGroupedForChart(rows, labelMap) {
  if (!rows?.length) return [{ name: "Sin datos", value: 0 }];
  return rows.map((r) => ({
    name: labelMap[r._id] != null ? labelMap[r._id] : String(r._id ?? "—"),
    value: r.count,
  }));
}

/**
 * GET /dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
  try {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - CANTIDAD_MESES_GRAFICO);
    desde.setHours(0, 0, 0, 0);
    const hoy = new Date();

    const [
      totalStudents,
      registeredCompanies,
      practicasOportunidadesActivas,
      practicasOportunidadesTotal,
      practicasPostulacionesTotal,
      monitoriaOportunidadesActivas,
      monitoriaOportunidadesTotal,
      monitoriaPostulacionesTotal,
      practicasLegalizacionesTotal,
      monitoriaLegalizacionesTotal,
      poPorMesAgg,
      mtmPorMesAgg,
      poEstadosOpp,
      mtmEstadosOpp,
      poEstadosPost,
      mtmEstadosPost,
      legPracticaEstados,
      legMtmEstados,
    ] = await Promise.all([
      Postulant.countDocuments({}),
      Company.countDocuments({}),
      Opportunity.countDocuments({ estado: "Activa", tipo: "practica" }),
      Opportunity.countDocuments({ tipo: "practica" }),
      PostulacionOportunidad.countDocuments({}),
      OportunidadMTM.countDocuments({ estado: "Activa" }),
      OportunidadMTM.countDocuments({}),
      PostulacionMTM.countDocuments({}),
      LegalizacionPractica.countDocuments({}),
      LegalizacionMTM.countDocuments({}),
      aggregatePostulacionesPorMes(PostulacionOportunidad, desde),
      aggregatePostulacionesPorMes(PostulacionMTM, desde),
      Opportunity.aggregate([
        { $match: { tipo: "practica" } },
        { $group: { _id: "$estado", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      OportunidadMTM.aggregate([
        { $group: { _id: "$estado", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PostulacionOportunidad.aggregate([
        { $group: { _id: "$estado", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PostulacionMTM.aggregate([
        { $group: { _id: "$estado", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      LegalizacionPractica.aggregate([
        { $group: { _id: "$estado", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      LegalizacionMTM.aggregate([
        { $group: { _id: "$estado", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const aplicacionesPracticaMes = rellenarUltimosMeses(poPorMesAgg, hoy);
    const aplicacionesMonitoriaMes = rellenarUltimosMeses(mtmPorMesAgg, hoy);

    const practicasPayload = {
      oportunidadesActivas: practicasOportunidadesActivas,
      oportunidadesTotal: practicasOportunidadesTotal,
      totalPostulaciones: practicasPostulacionesTotal,
      legalizacionesTotal: practicasLegalizacionesTotal,
      applicationsByMonth: aplicacionesPracticaMes,
      applicationTrends: aplicacionesPracticaMes,
      oportunidadesPorEstado: mapEstadosPie(poEstadosOpp),
      postulacionesPorEstado: mapGroupedForChart(poEstadosPost, LABELS_POSTULACION),
      legalizacionesPorEstado: mapGroupedForChart(legPracticaEstados, LABELS_LEGALIZACION),
    };

    const monitoriaPayload = {
      oportunidadesActivas: monitoriaOportunidadesActivas,
      oportunidadesTotal: monitoriaOportunidadesTotal,
      totalPostulaciones: monitoriaPostulacionesTotal,
      legalizacionesTotal: monitoriaLegalizacionesTotal,
      applicationsByMonth: aplicacionesMonitoriaMes,
      applicationTrends: aplicacionesMonitoriaMes,
      oportunidadesPorEstado: mapEstadosPie(mtmEstadosOpp),
      postulacionesPorEstado: mapGroupedForChart(mtmEstadosPost, LABELS_POSTULACION),
      legalizacionesPorEstado: mapGroupedForChart(legMtmEstados, LABELS_LEGALIZACION),
    };

    return res.json({
      shared: {
        totalStudents,
        registeredCompanies,
      },
      practicas: practicasPayload,
      monitoria: monitoriaPayload,
      totalStudents,
      registeredCompanies,
      availableOpportunities: practicasOportunidadesActivas,
      applicationsByMonth: aplicacionesPracticaMes,
      applicationTrends: aplicacionesPracticaMes,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
