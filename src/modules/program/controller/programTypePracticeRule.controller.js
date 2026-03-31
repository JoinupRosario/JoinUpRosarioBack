import mongoose from "mongoose";
import Program from "../model/program.model.js";
import {
  applyTipoPermitidoToProgram,
  applyTypePracticeItemToProgram,
  applyTypePracticeItemsToProgram,
  listProgramsWithTipoRule,
  listPracticeTypeItemsForApi,
} from "../services/programTypePracticeRule.service.js";

/**
 * GET /programs/type-practice-rule-items
 * Ítems del catálogo tipo práctica (`items` filtrados por `listId`, p. ej. L_PRACTICE_TYPE).
 */
export const getTypePracticeRuleItems = async (req, res) => {
  try {
    const payload = await listPracticeTypeItemsForApi();
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /programs/type-practice-rules
 * Lista programas con tipo(s) de práctica permitidos (parametrización cargue UEJOBS).
 */
export const getTypePracticeRules = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const result = await listProgramsWithTipoRule({ page, limit, search });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /programs/:programId/type-practice-rule
 * Body preferido: { typePracticeItemIds: ObjectId[] | null } — varios ítems del catálogo, o null = no aplica UEJOBS.
 * Compat: { typePracticeItemId: ObjectId | null } un solo ítem.
 * Compat: { tipoPermitido: "PRACTICA" | "PASANTIA" | "NO_APLICA" } — PRACTICA/PASANTIA aplican pares nacional+internacional del catálogo si existen; NO_APLICA = N/A en Excel (sin ítem en items).
 */
export const putTypePracticeRule = async (req, res) => {
  try {
    const { programId } = req.params;
    const body = req.body || {};
    const { tipoPermitido, typePracticeItemId, typePracticeItemIds } = body;
    const sentArrayKey = Object.prototype.hasOwnProperty.call(body, "typePracticeItemIds");
    const sentItemKey = Object.prototype.hasOwnProperty.call(body, "typePracticeItemId");

    if (!mongoose.Types.ObjectId.isValid(programId)) {
      return res.status(400).json({ message: "programId no válido" });
    }

    const program = await Program.findById(programId).select("_id name").lean();
    if (!program) {
      return res.status(404).json({ message: "Programa no encontrado" });
    }

    let result;

    if (sentArrayKey) {
      const raw = typePracticeItemIds;
      if (raw === null || (Array.isArray(raw) && raw.length === 0)) {
        result = await applyTypePracticeItemsToProgram(program._id, null);
      } else if (Array.isArray(raw)) {
        const ids = [...new Set(raw.filter((id) => mongoose.Types.ObjectId.isValid(id)))];
        if (ids.length === 0) {
          return res.status(400).json({ message: "typePracticeItemIds no contiene ids válidos" });
        }
        result = await applyTypePracticeItemsToProgram(program._id, ids);
      } else {
        return res.status(400).json({ message: "typePracticeItemIds debe ser un array de ObjectId o null" });
      }
      res.json({
        message: "Regla actualizada",
        programId: program._id,
        typePracticeItemIds: result.typePracticeItemIds ?? [],
        typePracticeItemId: result.typePracticeItemId ?? null,
        ...result,
      });
      return;
    }

    if (sentItemKey) {
      if (typePracticeItemId === null || typePracticeItemId === "") {
        result = await applyTypePracticeItemsToProgram(program._id, null);
      } else if (mongoose.Types.ObjectId.isValid(typePracticeItemId)) {
        result = await applyTypePracticeItemToProgram(program._id, typePracticeItemId);
      } else {
        return res.status(400).json({ message: "typePracticeItemId no válido" });
      }
      res.json({
        message: "Regla actualizada",
        programId: program._id,
        typePracticeItemIds: result.typePracticeItemIds ?? [],
        typePracticeItemId: result.typePracticeItemId ?? null,
        ...result,
      });
      return;
    }

    const allowed = ["PRACTICA", "PASANTIA", "NO_APLICA"];
    if (!allowed.includes(tipoPermitido)) {
      return res.status(400).json({
        message: `Envíe typePracticeItemIds, typePracticeItemId o tipoPermitido: ${allowed.join(", ")}`,
      });
    }

    result = await applyTipoPermitidoToProgram(program._id, tipoPermitido);
    res.json({
      message: "Regla actualizada",
      programId: program._id,
      tipoPermitido,
      typePracticeItemIds: result.typePracticeItemIds ?? [],
      typePracticeItemId: result.typePracticeItemId ?? null,
      ...result,
    });
  } catch (error) {
    const msg = error.message || "Error al guardar";
    if (msg.includes("no tiene programas")) {
      return res.status(400).json({ message: msg });
    }
    if (msg.includes("No se encontró ítem") || msg.includes("Ítem") || msg.includes("no válido")) {
      return res.status(400).json({ message: msg });
    }
    res.status(500).json({ message: msg });
  }
};
