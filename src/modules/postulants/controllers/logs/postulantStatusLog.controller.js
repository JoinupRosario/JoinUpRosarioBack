import postulantStatusLog from "../../models/logs/postulantLogStatus.schema.js";

export const getPostulantStatusLogs = async (req, res) => {
  try {
    const logs = await postulantStatusLog.find()
      .populate({
        path: "postulant",
        populate: {
          path: "user",
          select: "name"
        }
      })
      .populate("changed_by", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const formattedLogs = logs.map(log => {
      const userName = log.postulant?.user?.name || '';
      const userLastname = log.postulant?.user?.lastname || '';
      const fullName = userLastname 
        ? `${userName} ${userLastname}`.trim()
        : userName;

      return {
        full_name: fullName,
        name: userName,
        lastname: userLastname,
        previous_status: log.status_before || '-',
        new_status: log.status_after,
        reason: log.reason || '-',
        date: log.createdAt,
        modified_by: log.changed_by
          ? `${log.changed_by.name}${log.changed_by.email ? ` (${log.changed_by.email})` : ''}`
          : "Sistema"
      };
    });

    res.json(formattedLogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
