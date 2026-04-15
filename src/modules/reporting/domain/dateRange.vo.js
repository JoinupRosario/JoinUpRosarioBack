/**
 * Rango de fechas de dominio (sin SQL ni transporte).
 */
export class DateRange {
  /**
   * @param {{ from: Date; to: Date }} p
   */
  constructor({ from, to }) {
    this.from = from;
    this.to = to;
  }

  /**
   * @param {unknown} raw
   * @returns {DateRange}
   */
  static fromUnknown(raw) {
    if (!raw || typeof raw !== "object") {
      throw new Error("date_range inválido: se espera un objeto { from, to }");
    }
    const from = DateRange._parseDate(/** @type {any} */ (raw).from, "from");
    const to = DateRange._parseDate(/** @type {any} */ (raw).to, "to");
    if (from.getTime() > to.getTime()) {
      throw new Error("date_range inválido: from es posterior a to");
    }
    return new DateRange({ from, to });
  }

  /**
   * @param {unknown} v
   * @param {"from"|"to"} label
   */
  static _parseDate(v, label) {
    const d = v instanceof Date ? v : new Date(/** @type {any} */ (v));
    if (Number.isNaN(d.getTime())) {
      throw new Error(`date_range inválido: ${label} no es una fecha válida`);
    }
    return d;
  }
}
