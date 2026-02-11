import Program from "../model/program.model.js";

export const getPrograms = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { code: searchRegex },
        { level: searchRegex },
        { labelLevel: searchRegex },
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      Program.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
      Program.countDocuments(filter),
    ]);

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProgramById = async (req, res) => {
  try {
    const program = await Program.findById(req.params.id);
    if (!program) {
      return res.status(404).json({ message: "Programa no encontrado" });
    }
    res.json(program);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProgramByMysqlId = async (req, res) => {
  try {
    const program = await Program.findOne({ mysqlId: parseInt(req.params.mysqlId, 10) });
    if (!program) {
      return res.status(404).json({ message: "Programa no encontrado" });
    }
    res.json(program);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createProgram = async (req, res) => {
  try {
    const program = await Program.create(req.body);
    res.status(201).json(program);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateProgram = async (req, res) => {
  try {
    const program = await Program.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!program) {
      return res.status(404).json({ message: "Programa no encontrado" });
    }
    res.json(program);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteProgram = async (req, res) => {
  try {
    const program = await Program.findByIdAndDelete(req.params.id);
    if (!program) {
      return res.status(404).json({ message: "Programa no encontrado" });
    }
    res.json({ message: "Programa eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
