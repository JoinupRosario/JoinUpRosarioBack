import mongoose from "mongoose";

// ── Variables académicas disponibles para construir reglas ────────────────────
export const ACADEMIC_VARIABLES = [
  { key: "creditosMatriculados",                label: "Créditos Matriculados",                        tipologia: null,  fuente: "getInfoacademica" },
  { key: "creditosAprobados",                   label: "Créditos Aprobados",                           tipologia: null,  fuente: "getInfoacademica" },
  { key: "creditosPlan",                        label: "Créditos del Plan (credreq)",                  tipologia: null,  fuente: "getprogramas"     },
  { key: "porcentajeCreditosAprobados",         label: "% Créditos Aprobados",                         tipologia: null,  fuente: "calculado"        },
  { key: "porcentajeCreditosCursados",          label: "% Créditos Cursados",                          tipologia: null,  fuente: "calculado"        },
  { key: "promedioAcumulado",                   label: "Promedio Acumulado",                            tipologia: null,  fuente: "getInfoacademica" },
  { key: "semestreSegunCreditos",               label: "Semestre según Créditos",                      tipologia: null,  fuente: "calculado"        },
  { key: "creditosObligatoriosMatriculados",    label: "Créditos Obligatorios Matriculados (T)",       tipologia: "T",   fuente: "getInfoacademica" },
  { key: "creditosObligatoriosAprobados",       label: "Créditos Obligatorios Aprobados (T)",          tipologia: "T",   fuente: "getInfoacademica" },
  { key: "creditosComplementariosMatriculados", label: "Créditos Complementarios Matriculados (C)",   tipologia: "C",   fuente: "getInfoacademica" },
  { key: "creditosComplementariosAprobados",    label: "Créditos Complementarios Aprobados (C)",      tipologia: "C",   fuente: "getInfoacademica" },
  { key: "creditosElectivosMatriculados",       label: "Créditos Electivos Matriculados (L)",          tipologia: "L",   fuente: "getInfoacademica" },
  { key: "creditosElectivosAprobados",          label: "Créditos Electivos Aprobados (L)",             tipologia: "L",   fuente: "getInfoacademica" },
  { key: "creditosElectivosHMMatriculados",     label: "Créditos Electivos HM Matriculados (O)",       tipologia: "O",   fuente: "getInfoacademica" },
  { key: "creditosElectivosHMAprobados",        label: "Créditos Electivos HM Aprobados (O)",          tipologia: "O",   fuente: "getInfoacademica" },
  { key: "creditosIndispensablesMatriculados",  label: "Créditos Indispensables Matriculados (B)",     tipologia: "B",   fuente: "getInfoacademica" },
  { key: "creditosIndispensablesAprobados",     label: "Créditos Indispensables Aprobados (B)",        tipologia: "B",   fuente: "getInfoacademica" },
];

export const OPERATORS = [
  { key: ">=",       label: "Mayor o igual a (≥)" },
  { key: "<=",       label: "Menor o igual a (≤)" },
  { key: "=",        label: "Igual a (=)"          },
  { key: "!=",       label: "Diferente a (≠)"      },
  { key: "contiene", label: "Contiene"              },
];

// ── Sub-esquemas ──────────────────────────────────────────────────────────────
const condicionItemSchema = new mongoose.Schema(
  {
    variable: { type: String, required: true },
    operador: { type: String, enum: [">=", "<=", "=", "!=", "contiene"], required: true },
    valor:    { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const asignaturaRequeridaSchema = new mongoose.Schema(
  {
    asignatura: { type: mongoose.Schema.Types.ObjectId, ref: "Asignatura", required: true },
    tipo:       { type: String, enum: ["matriculada", "aprobada"], required: true },
  },
  { _id: false }
);

// ── Esquema principal ─────────────────────────────────────────────────────────
const condicionCurricularSchema = new mongoose.Schema(
  {
    nombre:               { type: String, required: true, trim: true },
    periodo:              { type: mongoose.Schema.Types.ObjectId, ref: "Periodo", required: true },
    facultad:             { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
    programas:            [{ type: mongoose.Schema.Types.ObjectId, ref: "Program" }],
    logica:               { type: String, enum: ["AND", "OR"], default: "AND" },
    condiciones:          [condicionItemSchema],
    asignaturasRequeridas:[asignaturaRequeridaSchema],
    estado:               { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    userCreator:          { type: String, trim: true },
    userUpdater:          { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("CondicionCurricular", condicionCurricularSchema);
