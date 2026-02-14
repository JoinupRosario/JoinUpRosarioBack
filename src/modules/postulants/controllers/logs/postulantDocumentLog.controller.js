import PostulantDocument from "../../models/logs/postulantLogDocumentSchema.js";

export const getPostulantDocumentLogs = async (req, res) => {
  try {
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

    const formattedDocuments = documents.map(doc => {
      const user = doc.postulant?.postulantId;
      const userName = user?.name || '';
      const userLastname = user?.lastname || '';
      const fullName = userLastname 
        ? `${userName} ${userLastname}`.trim()
        : userName;

      return {
        full_name: fullName,
        identification: user?.code ?? doc.postulant?.identity_postulant ?? '-',
        email: user?.email || '-',
        document_type: doc.document_type || '-',
        content: doc.content || doc.file_url || '-',
        observation: doc.observations || '-',
        date: doc.createdAt
      };
    });

    res.json(formattedDocuments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
