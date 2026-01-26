import PostulantDocument from "../../models/logs/postulantLogDocumentSchema.js";

export const getPostulantDocumentLogs = async (req, res) => {
  try {
    const documents = await PostulantDocument.find()
      .populate({
        path: "postulant",
        populate: {
          path: "user",
          select: "name email"
        }
      })
      .sort({ createdAt: -1 })
      .lean();

    const formattedDocuments = documents.map(doc => {
      const userName = doc.postulant?.user?.name || '';
      const userLastname = doc.postulant?.user?.lastname || '';
      const fullName = userLastname 
        ? `${userName} ${userLastname}`.trim()
        : userName;

      return {
        full_name: fullName,
        identification: doc.postulant?.identity_postulant || '-',
        email: doc.postulant?.user?.email || '-',
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
