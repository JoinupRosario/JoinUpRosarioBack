import ProgramAll from "./programAll.schema.js";

/**
 * GET /program-alls — Lista programas (catálogo program_all) para selects.
 * Query: limit (default 2000), search (nombre/código), status.
 */
export const getProgramAllList = async (req, res) => {
  try {
    const { limit = 2000, search, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search && String(search).trim()) {
      const searchRegex = { $regex: String(search).trim(), $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { code: searchRegex },
        { level: searchRegex },
        { labelLevel: searchRegex },
      ];
    }
    const limitNum = Math.min(parseInt(limit, 10) || 2000, 5000);
    const data = await ProgramAll.find(filter)
      .sort({ name: 1 })
      .limit(limitNum)
      .select("_id name code level labelLevel status")
      .lean();
    res.json({ data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
