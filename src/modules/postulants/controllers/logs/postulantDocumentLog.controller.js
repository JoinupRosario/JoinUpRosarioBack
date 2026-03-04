import PostulantDocument from "../../models/logs/postulantLogDocumentSchema.js";

/**
 * GET /postulant-logs/documents
 * Query: page (default 1), limit (default 10), search (opcional).
 * Búsqueda sobre todo el conjunto: por identificación, nombre y apellidos, email.
 * Respuesta: { data, total, page, limit, totalPages }
 */
export const getPostulantDocumentLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search && String(req.query.search).trim()) || "";

    const documents = await PostulantDocument.find()
      .populate({
        path: "postulant",
        populate: {
          path: "postulantId",
          select: "name email code"
        }
      })
      .sort({ createdAt: -1 })
      .lean();

    const formattedDocuments = documents.map((doc) => {
      const user = doc.postulant?.postulantId;
      const userName = user?.name || "";
      const userLastname = user?.lastname || "";
      const fullName = userLastname ? `${userName} ${userLastname}`.trim() : userName;
      const identification = user?.code ?? doc.postulant?.identity_postulant ?? "-";
      const email = user?.email || "-";

      return {
        full_name: fullName,
        identification,
        email,
        document_type: doc.document_type || "-",
        content: doc.content || doc.file_url || "-",
        observation: doc.observations || "-",
        date: doc.createdAt
      };
    });

    let filtered = formattedDocuments;
    if (search) {
      const term = search.toLowerCase();
      filtered = formattedDocuments.filter(
        (doc) =>
          (doc.full_name || "").toLowerCase().includes(term) ||
          (doc.identification || "").toLowerCase().includes(term) ||
          (doc.email || "").toLowerCase().includes(term)
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
