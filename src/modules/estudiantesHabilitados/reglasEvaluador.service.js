/**
 * Evaluador de reglas curriculares (RQ02_HU006).
 *
 * Toma los datos académicos del estudiante devueltos por consultaInfAcademica (OSB)
 * y evalúa si cumple con las condiciones de una regla curricular.
 *
 * Estructura OSB (items[0].resultSet.items[]):
 * {
 *   creditos_matriculados, creditos_conseguidos, creditos_plan,
 *   promedioacumulado, promediosemestral, semestre,
 *   codigoplan, egresado, bloqueado, ...
 *   tipologia: [ { tipologia, creditos_matriculados, creditos_conseguidos } ]
 * }
 */

/**
 * Extrae el valor de una variable académica para un plan específico,
 * usando los datos devueltos por consultaInfAcademica.
 *
 * @param {string} variable  Clave del modelo (ej. "creditosMatriculados")
 * @param {Object} planData  Objeto del resultSet de OSB para el plan del estudiante
 * @returns {number|null}
 */
function extraerValor(variable, planData) {
  if (!planData) return null;

  const tip = (t) => {
    const arr = planData.tipologia || [];
    const row = arr.find((r) => (r.tipologia || "").toUpperCase() === t.toUpperCase());
    return row || null;
  };

  switch (variable) {
    case "creditosMatriculados":
      return Number(planData.creditos_matriculados ?? 0);
    case "creditosAprobados":
      return Number(planData.creditos_conseguidos ?? 0);
    case "creditosPlan":
      return Number(planData.creditos_plan ?? 0);
    case "porcentajeCreditosAprobados": {
      const plan = Number(planData.creditos_plan ?? 0);
      return plan > 0
        ? parseFloat(((Number(planData.creditos_conseguidos ?? 0) / plan) * 100).toFixed(2))
        : 0;
    }
    case "porcentajeCreditosCursados": {
      const plan = Number(planData.creditos_plan ?? 0);
      const cursados = Number(planData.creditos_matriculados ?? 0) + Number(planData.creditos_conseguidos ?? 0);
      return plan > 0 ? parseFloat(((cursados / plan) * 100).toFixed(2)) : 0;
    }
    case "promedioAcumulado":
      return Number(planData.promedioacumulado ?? 0);
    case "semestreSegunCreditos":
      return Number(planData.semestre ?? 0);

    // ── Tipología T (Obligatorias) ──────────────────────────────────────────
    case "creditosObligatoriosMatriculados":
      return Number(tip("T")?.creditos_matriculados ?? 0);
    case "creditosObligatoriosAprobados":
      return Number(tip("T")?.creditos_conseguidos ?? 0);

    // ── Tipología C (Complementarios) ──────────────────────────────────────
    case "creditosComplementariosMatriculados":
      return Number(tip("C")?.creditos_matriculados ?? 0);
    case "creditosComplementariosAprobados":
      return Number(tip("C")?.creditos_conseguidos ?? 0);

    // ── Tipología L (Electivos) ─────────────────────────────────────────────
    case "creditosElectivosMatriculados":
      return Number(tip("L")?.creditos_matriculados ?? 0);
    case "creditosElectivosAprobados":
      return Number(tip("L")?.creditos_conseguidos ?? 0);

    // ── Tipología O (Electivos HM) ──────────────────────────────────────────
    case "creditosElectivosHMMatriculados":
      return Number(tip("O")?.creditos_matriculados ?? 0);
    case "creditosElectivosHMAprobados":
      return Number(tip("O")?.creditos_conseguidos ?? 0);

    // ── Tipología B (Indispensables) ────────────────────────────────────────
    case "creditosIndispensablesMatriculados":
      return Number(tip("B")?.creditos_matriculados ?? 0);
    case "creditosIndispensablesAprobados":
      return Number(tip("B")?.creditos_conseguidos ?? 0);

    default:
      return null;
  }
}

/**
 * Evalúa una condición individual.
 */
function evaluarCondicion(condicion, planData) {
  const valorReal = extraerValor(condicion.variable, planData);
  if (valorReal === null) return { cumple: false, valorReal: null };

  const esperado = Number(condicion.valor);

  let cumple = false;
  switch (condicion.operador) {
    case ">=": cumple = valorReal >= esperado; break;
    case "<=": cumple = valorReal <= esperado; break;
    case "=":  cumple = valorReal === esperado; break;
    case "!=": cumple = valorReal !== esperado; break;
    case "contiene":
      cumple = String(valorReal).toLowerCase().includes(String(condicion.valor).toLowerCase());
      break;
    default:   cumple = false;
  }

  return { cumple, valorReal };
}

/**
 * Evalúa una regla curricular completa contra los datos académicos de un estudiante.
 *
 * @param {Object} regla      Documento de CondicionCurricular (populado)
 * @param {Array}  infoAcad   Array de planes devuelto por consultaInfAcademica
 * @param {string} codigoPlan Código del plan a evaluar (ej. "AE02")
 * @returns {{ cumple: boolean, detalle: Array }}
 */
export function evaluarRegla(regla, infoAcad, codigoPlan) {
  // Buscar el plan específico en la respuesta OSB
  const planData = (infoAcad || []).find(
    (p) => (p.codigoplan || "").toUpperCase() === (codigoPlan || "").toUpperCase()
  );

  if (!planData) {
    return {
      cumple:  false,
      detalle: [],
      error:   `Plan "${codigoPlan}" no encontrado en datos académicos del estudiante`,
    };
  }

  const condiciones = regla.condiciones || [];
  if (condiciones.length === 0) return { cumple: true, detalle: [] };

  const detalle = condiciones.map((c) => {
    const { cumple, valorReal } = evaluarCondicion(c, planData);
    return {
      variable:      c.variable,
      operador:      c.operador,
      valorEsperado: c.valor,
      valorReal,
      cumple,
    };
  });

  const logica = (regla.logica || "AND").toUpperCase();
  const cumple = logica === "AND"
    ? detalle.every((d) => d.cumple)
    : detalle.some((d) => d.cumple);

  return { cumple, detalle };
}

/**
 * Evalúa todas las reglas aplicables a un estudiante y determina su estado curricular.
 * Si no hay reglas → EN_REVISION.
 * Si cumple todas → AUTORIZADO.
 * Si no cumple alguna → NO_AUTORIZADO.
 *
 * @param {Array}  reglas     Array de documentos CondicionCurricular
 * @param {Array}  infoAcad   Respuesta de consultaInfAcademica
 * @param {string} codigoPlan Código del plan (ej. "AE02")
 * @returns {{ estadoCurricular: string, reglasEvaluadas: Array }}
 */
export function evaluarTodasLasReglas(reglas, infoAcad, codigoPlan) {
  if (!reglas || reglas.length === 0) {
    return { estadoCurricular: "EN_REVISION", reglasEvaluadas: [] };
  }

  const reglasEvaluadas = reglas.map((regla) => {
    const { cumple, detalle, error } = evaluarRegla(regla, infoAcad, codigoPlan);
    return {
      reglaId:     regla._id,
      reglaNombre: regla.nombre,
      logica:      regla.logica,
      cumple,
      detalle:     detalle || [],
      error:       error || null,
    };
  });

  // Si TODAS las reglas se cumplen → AUTORIZADO
  const todasCumplen = reglasEvaluadas.every((r) => r.cumple);
  const estadoCurricular = todasCumplen ? "AUTORIZADO" : "NO_AUTORIZADO";

  return { estadoCurricular, reglasEvaluadas };
}
