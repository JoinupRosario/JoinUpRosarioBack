import postulantStatusLog from "../../models/logs/postulantLogStatus.schema.js";

/**
 * GET /postulant-logs/status
 * Query: page (default 1), limit (default 10), search (opcional).
 * Búsqueda sobre todo: nombre/apellidos del postulante y modificado por.
 * Respuesta: { data, total, page, limit, totalPages }
 */
export const getPostulantStatusLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search && String(req.query.search).trim()) || "";

    const logs = await postulantStatusLog.find()
      .populate({
        path: "postulant",
        populate: {
          path: "postulantId",
          select: "name email"
        }
      })
      .populate("changed_by", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const formattedLogs = logs.map((log) => {
      const user = log.postulant?.postulantId;
      const userName = user?.name || "";
      const userLastname = user?.lastname || "";
      const fullName = userLastname ? `${userName} ${userLastname}`.trim() : userName;
      const modifiedBy = log.changed_by
        ? `${log.changed_by.name || ""}${log.changed_by.email ? ` (${log.changed_by.email})` : ""}`.trim()
        : "Sistema";

      return {
        full_name: fullName,
        name: userName,
        lastname: userLastname,
        previous_status: log.status_before || "-",
        new_status: log.status_after,
        reason: log.reason || "-",
        date: log.createdAt,
        modified_by: modifiedBy || "Sistema"
      };
    });

    let filtered = formattedLogs;
    if (search) {
      const term = search.toLowerCase();
      filtered = formattedLogs.filter(
        (log) =>
          (log.full_name || "").toLowerCase().includes(term) ||
          (log.modified_by || "").toLowerCase().includes(term)
      );
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageSafe = Math.min(page, totalPages);
    const start = (pageSafe - 1) * limit;
    const data = filtered.slice(start, start + limit);

    res.json({ data, total, page: pageSafe, limit, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
