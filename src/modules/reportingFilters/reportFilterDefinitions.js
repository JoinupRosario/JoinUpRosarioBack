/**
 * Fuente declarativa de criterios por reporte (id = tarjeta en Reportes.jsx).
 * Alineado a los criterios de negocio (Monitorías / Prácticas).
 *
 * Periodo en selects remotos: `tipo: "practica"` coincide con la pantalla Periodos (Activos por defecto),
 * no con `tipo: "monitoria"` (subconjunto distinto del mismo catálogo).
 */

export const REPORT_FILTER_DEFINITIONS = {
  "mon-detalle-ofertas": {
    fields: [
      {
        kind: "date_range",
        startKey: "fechaCreacionDesde",
        endKey: "fechaCreacionHasta",
        label: "Rango de fechas de creación",
      },
      {
        kind: "date_range",
        startKey: "fechaActivacionDesde",
        endKey: "fechaActivacionHasta",
        label: "Rango de fechas de activación",
      },
      { kind: "select", key: "estado", label: "Estado de la oportunidad", enumKey: "oportunidad_mtm_estado" },
      {
        kind: "select",
        key: "categoriaItemId",
        label: "Categoría",
        catalogType: "L_MONITORING_TYPE",
      },
      {
        kind: "select",
        key: "periodoId",
        label: "Periodo",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
    ],
  },

  "mon-detallado-legalizaciones": {
    fields: [
      {
        kind: "autocomplete_postulant",
        key: "postulantId",
        label: "Estudiante",
        hint: "Un solo criterio: busque por nombre, email, código de usuario, identificación o código estudiantil.",
      },
      {
        kind: "select",
        key: "categoriaItemId",
        label: "Categoría",
        catalogType: "L_MONITORING_TYPE",
        hint: "Tipo de monitoría (catálogo L_MONITORING_TYPE).",
      },
      {
        kind: "select_program",
        key: "programaId",
        label: "Programas académicos",
        dependsOn: ["postulantId"],
        hint: "Tras elegir estudiante: programas asociados a su perfil.",
        searchable: true,
      },
      {
        kind: "select",
        key: "periodoId",
        label: "Período académico",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
      {
        kind: "select",
        key: "asignaturaId",
        label: "Asignatura",
        optionEndpoint: "/asignaturas",
        endpointQuery: { limit: 200, page: 1 },
        valueField: "_id",
        labelField: "nombreAsignatura",
        searchable: true,
      },
      { kind: "select", key: "estadoLegalizacion", label: "Estado de aprobación", enumKey: "legalizacion_mtm_estado" },
      { kind: "switch", key: "soloDocumentosPendientes", label: "Con documentos pendientes por cargar" },
      { kind: "switch", key: "soloDocumentosRechazados", label: "Con documentos rechazados" },
    ],
  },

  "mon-seguimiento": {
    fields: [
      {
        kind: "select",
        key: "categoriaItemId",
        label: "Categoría",
        catalogType: "L_MONITORING_TYPE",
        hint: "Ítems del listado L_MONITORING_TYPE (tipo de monitoría).",
      },
      { kind: "text", key: "codigoMonitoria", label: "Código de monitoría", hint: "Código o parte del código" },
      {
        kind: "select",
        key: "periodoId",
        label: "Periodo académico",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
      {
        kind: "select",
        key: "asignaturaId",
        label: "Asignatura",
        optionEndpoint: "/asignaturas",
        endpointQuery: { limit: 200, page: 1 },
        valueField: "_id",
        labelField: "nombreAsignatura",
        searchable: true,
      },
      { kind: "autocomplete_postulant", key: "postulantId", label: "Código estudiante" },
      {
        kind: "text",
        key: "coordinadorNombre",
        label: "Nombres coordinador",
        hint: "Texto para localizar al coordinador (select remoto pendiente de catálogo)",
      },
      {
        kind: "select",
        key: "estadoAprobacion",
        label: "Estado de aprobación",
        enumKey: "seguimiento_actividad_mtm_estado",
      },
    ],
  },

  "mon-aplicaciones-ofertas": {
    fields: [
      {
        kind: "select_program",
        key: "programaId",
        label: "Programas académicos",
        dependsOn: [],
        searchable: true,
      },
      { kind: "date_range", startKey: "fechaAplicacionDesde", endKey: "fechaAplicacionHasta", label: "Rango de fechas de aplicación" },
      {
        kind: "select",
        key: "periodoId",
        label: "Periodo académico",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
    ],
  },

  "mon-evaluaciones": {
    fields: [
      {
        kind: "autocomplete_postulant",
        key: "postulantId",
        label: "Estudiante",
        },
      {
        kind: "select",
        key: "periodoId",
        label: "Periodo",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
      { kind: "date_range", startKey: "fechaEnvioDesde", endKey: "fechaEnvioHasta", label: "Rango de fechas de envío" },
    ],
  },

  "mon-historico": {
    functionalDefinitionPending: true,
    pendingReason: "Delimitar fuentes (legalización, plan, actividades) al generar el archivo final.",
    fields: [
      {
        kind: "select",
        key: "facultadId",
        label: "Facultad",
        optionEndpoint: "/faculties/active-list",
        endpointQuery: {},
        valueField: "_id",
        labelField: "name",
      },
      {
        kind: "select",
        key: "periodoId",
        label: "Periodo",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
      { kind: "date_range", startKey: "fechaActividadDesde", endKey: "fechaActividadHasta", label: "Rango de fechas de actividad" },
    ],
  },

  "mon-estadistico": {
    fields: [{ kind: "date_range", startKey: "fechaDesde", endKey: "fechaHasta", label: "Rango de fechas" }],
  },

  /** Sin filtros: el alcance lo define el propio informe (egresados con experiencia MTM). */
  "mon-graduados": {
    fields: [],
  },

  "mon-planes-trabajo": {
    fields: [{ kind: "date_range", startKey: "fechaDesde", endKey: "fechaHasta", label: "Rango de fechas" }],
  },

  "mon-asistencia": {
    fields: [{ kind: "date_range", startKey: "fechaDesde", endKey: "fechaHasta", label: "Rango de fechas" }],
  },

  /** Sin filtros: exportación directa. Cabeceras alineadas a parámetro legado `MONITORING_DAF_REPORT_HD` (reporte_monitoria_daf_). */
  "mon-daf-vinculacion": {
    fields: [],
  },

  "mon-daf-reconocimiento": {
    functionalDefinitionPending: true,
    pendingReason: "Informe DAF: sin tablas parametrizadas en el alcance actual.",
    fields: [],
  },

  "mon-resumen-legalizaciones-mtm": {
    fields: [
      {
        kind: "select",
        key: "periodoId",
        label: "Periodo (opcional)",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
    ],
  },

  // ——— Prácticas ———
  /** Solo oportunidades `Opportunity.tipo === "practica"` (la pestaña ya delimita el módulo). */
  "prac-detalle-oportunidades": {
    fields: [
      {
        kind: "date_range",
        startKey: "fechaCreacionDesde",
        endKey: "fechaCreacionHasta",
        label: "Rango de fechas de creación",
      },
      {
        kind: "date_range",
        startKey: "fechaActivacionDesde",
        endKey: "fechaActivacionHasta",
        label: "Rango de fechas de activación",
      },
      {
        kind: "select",
        key: "estadoOportunidad",
        label: "Estado de la oportunidad",
        enumKey: "oportunidad_practica_estado",
      },
      {
        kind: "select_program",
        key: "programaId",
        label: "Programas",
        dependsOn: [],
        searchable: true,
      },
      {
        kind: "numeric_range_with_unit",
        minKey: "experienciaRequeridaMin",
        maxKey: "experienciaRequeridaMax",
        unitKey: "experienciaRequeridaUnidad",
        label: "Rango de experiencia requerida",
      },
      {
        kind: "decimal_range_row",
        minKey: "salarioMin",
        maxKey: "salarioMax",
        label: "Rango salarial",
        localeTag: "es-CO",
        fractionDigits: 2,
      },
      {
        kind: "select",
        key: "empresaId",
        label: "Entidad",
        optionEndpoint: "/companies",
        endpointQuery: { limit: 100, page: 1 },
        valueField: "_id",
        labelField: "name",
        searchable: true,
      },
    ],
  },

  "prac-entidades-contactos": {
    fields: [
      { kind: "text", key: "razonSocial", label: "Razón social", hint: "Búsqueda parcial" },
      { kind: "text", key: "nit", label: "NIT" },
      {
        kind: "date_range",
        startKey: "fechaCreacionDesde",
        endKey: "fechaCreacionHasta",
        label: "Rango de fechas de creación",
      },
      {
        kind: "date_range",
        startKey: "fechaActivacionDesde",
        endKey: "fechaActivacionHasta",
        label: "Rango de fechas de activación",
      },
      {
        kind: "select",
        key: "estadoEntidad",
        label: "Estado de la entidad",
        enumKey: "entidad_status",
      },
      { kind: "switch", key: "soloEntidadesSuspendidas", label: "Solo entidades suspendidas" },
    ],
  },

  "prac-estadisticos-general": {
    fields: [{ kind: "date_range", startKey: "fechaDesde", endKey: "fechaHasta", label: "Rango de fechas" }],
  },

  "prac-legalizacion-reporte-general": {
    fields: [{ kind: "date_range", startKey: "fechaDesde", endKey: "fechaHasta", label: "Rango de fechas" }],
  },

  "prac-legalizacion-eval-seguimiento": {
    fields: [{ kind: "date_range", startKey: "fechaDesde", endKey: "fechaHasta", label: "Rango de fechas" }],
  },

  /** Solo cierres de oportunidades de práctica (`tipo: practica`), acorde a la pestaña Prácticas. */
  "prac-cierre-oportunidades": {
    fields: [
      { kind: "date_range", startKey: "fechaCierreDesde", endKey: "fechaCierreHasta", label: "Rango de fechas de cierre" },
      {
        kind: "select_program",
        key: "programaId",
        label: "Programas académicos",
        dependsOn: [],
        searchable: true,
      },
      {
        kind: "select",
        key: "empresaId",
        label: "Entidad",
        optionEndpoint: "/companies",
        endpointQuery: { limit: 100, page: 1 },
        valueField: "_id",
        labelField: "name",
        searchable: true,
      },
    ],
  },

  "prac-escenarios-vs-contactos": {
    functionalDefinitionPending: true,
    pendingReason: "Relación escenarios vs contactos: delimitar entidades y reglas de cruce.",
    fields: [],
  },

  "prac-postulantes": {
    fields: [
      {
        kind: "select_program",
        key: "programaEnCursoId",
        label: "Programa en curso",
        dependsOn: [],
        searchable: true,
      },
      {
        kind: "select_program",
        key: "programaFinalizadoId",
        label: "Programas finalizados",
        dependsOn: [],
        searchable: true,
      },
      {
        kind: "date_range",
        startKey: "perfilActualizadoDesde",
        endKey: "perfilActualizadoHasta",
        label: "Rango de fechas de actualización de perfil",
      },
      { kind: "switch", key: "soloProgramasUniversidad", label: "Solo programas de la universidad" },
    ],
  },

  "prac-acuerdos-vinculacion": {
    fields: [
      { kind: "autocomplete_postulant", key: "postulantId", label: "Estudiante" },
      {
        kind: "select",
        key: "empresaId",
        label: "Entidad",
        optionEndpoint: "/companies",
        endpointQuery: { limit: 100, page: 1 },
        valueField: "_id",
        labelField: "name",
        searchable: true,
      },
      {
        kind: "select_program",
        key: "programaId",
        label: "Programas",
        dependsOn: ["postulantId"],
        searchable: true,
      },
      {
        kind: "select",
        key: "periodoId",
        label: "Periodo",
        optionEndpoint: "/periodos",
        endpointQuery: { tipo: "practica", limit: 200, estado: "Activo", page: 1 },
        valueField: "_id",
        labelField: "codigo",
        searchable: true,
      },
      { kind: "date_range", startKey: "fechaAprobacionDesde", endKey: "fechaAprobacionHasta", label: "Rango de fechas de aprobación" },
    ],
  },

  "prac-snies": {
    functionalDefinitionPending: true,
    pendingReason: "Formato regulatorio SNIES por definir.",
    fields: [],
  },
};
