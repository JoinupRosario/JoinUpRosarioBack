/**
 * Evaluador de reglas curriculares (RQ02_HU006).
 *
 * - Condiciones numéricas: datos de consultaInfAcademica (OSB).
 * - Asignaturas requeridas: Consulta_asignatura UXXI (documento + plan) — aprobada = nota AP;
 *   matriculada = inscrito_actualmente S/SI/Y.
 */

function normStr(v) {
  return String(v ?? "").trim();
}

/**
 * ¿La fila UXXI corresponde a la asignatura del catálogo (idAsignatura / codAsignatura)?
 */
export function uxxiFilaCorrespondeAsignatura(uxxiItem, asigDoc) {
  if (!asigDoc || typeof asigDoc !== "object") return false;
  const idUxxi = normStr(uxxiItem.identificador_asignatura);
  const codUxxi = normStr(uxxiItem.codigo_asignatura);
  const idDb = normStr(asigDoc.idAsignatura);
  const codDb = normStr(asigDoc.codAsignatura);
  if (idDb && idUxxi && idDb === idUxxi) return true;
  if (codDb && codUxxi && codDb === codUxxi) return true;
  if (idDb && codUxxi && idDb === codUxxi) return true;
  if (codDb && idUxxi && codDb === idUxxi) return true;
  return false;
}

function esAprobadaUxxi(it) {
  const na = normStr(it.nota_alfanumerica).toUpperCase();
  if (na === "AP" || na === "A" || na === "SB") return true;
  const nn = parseFloat(String(it.nota_numerica ?? "").replace(",", "."));
  return Number.isFinite(nn) && nn >= 3.0;
}

function esMatriculadaActualUxxi(it) {
  const ins = normStr(it.inscrito_actualmente).toUpperCase();
  return ins === "S" || ins === "Y" || ins === "SI" || ins === "1";
}

/**
 * @param {Array} itemsUxxi  resultSet.items de Consulta_asignatura
 */
export function evaluarAsignaturasRequeridas(regla, itemsUxxi) {
  const reqs = regla.asignaturasRequeridas || [];
  if (reqs.length === 0) {
    return { cumple: true, detalleAsignaturas: [] };
  }
  const items = Array.isArray(itemsUxxi) ? itemsUxxi : [];
  if (items.length === 0) {
    return {
      cumple: false,
      detalleAsignaturas: reqs.map((req) => ({
        tipoRequerido: req.tipo || "matriculada",
        etiqueta: labelAsignatura(req),
        cumple: false,
        motivo: "Sin datos de asignaturas UXXI para este plan",
      })),
    };
  }

  const detalleAsignaturas = [];
  let allOk = true;

  for (const req of reqs) {
    const asig = req.asignatura;
    const tipo = (req.tipo || "matriculada").toLowerCase();
    const etiqueta = labelAsignatura(req);
    const filas = items.filter((it) => uxxiFilaCorrespondeAsignatura(it, asig));

    if (filas.length === 0) {
      detalleAsignaturas.push({
        tipoRequerido: tipo,
        etiqueta,
        cumple: false,
        motivo: "La asignatura no aparece en el historial UXXI del plan",
      });
      allOk = false;
      continue;
    }

    if (tipo === "aprobada") {
      const ok = filas.some(esAprobadaUxxi);
      detalleAsignaturas.push({
        tipoRequerido: "aprobada",
        etiqueta,
        cumple: ok,
        motivo: ok
          ? "Cumple: nota alfanumérica aprobatoria (p. ej. AP) o numérica ≥ 3.0"
          : "No cumple: no consta aprobada (se espera AP u homólogo en UXXI)",
      });
      if (!ok) allOk = false;
    } else {
      const ok = filas.some(esMatriculadaActualUxxi);
      detalleAsignaturas.push({
        tipoRequerido: "matriculada",
        etiqueta,
        cumple: ok,
        motivo: ok
          ? "Cumple: inscrito actualmente en la asignatura (UXXI)"
          : "No cumple: no figura como inscrito actualmente",
      });
      if (!ok) allOk = false;
    }
  }

  return { cumple: allOk, detalleAsignaturas };
}

function labelAsignatura(req) {
  const a = req?.asignatura;
  if (a && typeof a === "object") {
    const n = normStr(a.nombreAsignatura);
    const c = normStr(a.codAsignatura || a.idAsignatura);
    return n ? `${c ? `${c} — ` : ""}${n}` : c || "Asignatura";
  }
  return "Asignatura";
}

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
    case "creditosObligatoriosMatriculados":
      return Number(tip("T")?.creditos_matriculados ?? 0);
    case "creditosObligatoriosAprobados":
      return Number(tip("T")?.creditos_conseguidos ?? 0);
    case "creditosComplementariosMatriculados":
      return Number(tip("C")?.creditos_matriculados ?? 0);
    case "creditosComplementariosAprobados":
      return Number(tip("C")?.creditos_conseguidos ?? 0);
    case "creditosElectivosMatriculados":
      return Number(tip("L")?.creditos_matriculados ?? 0);
    case "creditosElectivosAprobados":
      return Number(tip("L")?.creditos_conseguidos ?? 0);
    case "creditosElectivosHMMatriculados":
      return Number(tip("O")?.creditos_matriculados ?? 0);
    case "creditosElectivosHMAprobados":
      return Number(tip("O")?.creditos_conseguidos ?? 0);
    case "creditosIndispensablesMatriculados":
      return Number(tip("B")?.creditos_matriculados ?? 0);
    case "creditosIndispensablesAprobados":
      return Number(tip("B")?.creditos_conseguidos ?? 0);
    default:
      return null;
  }
}

function evaluarCondicion(condicion, planData) {
  const valorReal = extraerValor(condicion.variable, planData);
  if (valorReal === null) return { cumple: false, valorReal: null };

  const esperado = Number(condicion.valor);
  let cumple = false;
  switch (condicion.operador) {
    case ">=":
      cumple = valorReal >= esperado;
      break;
    case "<=":
      cumple = valorReal <= esperado;
      break;
    case "=":
      cumple = valorReal === esperado;
      break;
    case "!=":
      cumple = valorReal !== esperado;
      break;
    case "contiene":
      cumple = String(valorReal).toLowerCase().includes(String(condicion.valor).toLowerCase());
      break;
    default:
      cumple = false;
  }
  return { cumple, valorReal };
}

/**
 * @param {Array} [itemsAsignaturaUxxi]  Filas Consulta_asignatura (mismo documento + plan)
 */
export function evaluarRegla(regla, infoAcad, codigoPlan, itemsAsignaturaUxxi = []) {
  const condiciones = regla.condiciones || [];
  const reqsAsig = regla.asignaturasRequeridas || [];
  const planData = (infoAcad || []).find(
    (p) => (p.codigoplan || "").toUpperCase() === (codigoPlan || "").toUpperCase()
  );

  if (condiciones.length > 0 && !planData) {
    return {
      cumple: false,
      detalle: [],
      detalleAsignaturas: [],
      error: `Plan "${codigoPlan}" no encontrado en datos académicos del estudiante`,
    };
  }

  let detalle = [];
  let cumpleCond = true;
  if (condiciones.length > 0) {
    detalle = condiciones.map((c) => {
      const { cumple, valorReal } = evaluarCondicion(c, planData);
      return {
        variable: c.variable,
        operador: c.operador,
        valorEsperado: c.valor,
        valorReal,
        cumple,
      };
    });
    const logica = (regla.logica || "AND").toUpperCase();
    cumpleCond = logica === "AND" ? detalle.every((d) => d.cumple) : detalle.some((d) => d.cumple);
  }

  const { cumple: cumpleAsig, detalleAsignaturas } = evaluarAsignaturasRequeridas(regla, itemsAsignaturaUxxi);
  const cumple = cumpleCond && cumpleAsig;

  return { cumple, detalle, detalleAsignaturas, error: null };
}

/**
 * @param {Array} [itemsAsignaturaUxxi]  Consulta_asignatura(documento, codigoPlan)
 */
export function evaluarTodasLasReglas(reglas, infoAcad, codigoPlan, itemsAsignaturaUxxi = []) {
  if (!reglas || reglas.length === 0) {
    return { estadoCurricular: "EN_REVISION", reglasEvaluadas: [] };
  }

  const reglasEvaluadas = reglas.map((regla) => {
    const { cumple, detalle, detalleAsignaturas, error } = evaluarRegla(
      regla,
      infoAcad,
      codigoPlan,
      itemsAsignaturaUxxi
    );
    return {
      reglaId: regla._id,
      reglaNombre: regla.nombre,
      logica: regla.logica,
      cumple,
      detalle: detalle || [],
      detalleAsignaturas: detalleAsignaturas || [],
      error: error || null,
    };
  });

  const todasCumplen = reglasEvaluadas.every((r) => r.cumple);
  const estadoCurricular = todasCumplen ? "AUTORIZADO" : "NO_AUTORIZADO";
  return { estadoCurricular, reglasEvaluadas };
}
