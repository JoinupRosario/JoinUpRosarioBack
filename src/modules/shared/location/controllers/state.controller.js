import State from "../models/state.schema.js";

// Obtener todos los estados
export const getStates = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, country } = req.query;
    const filter = {};

    if (country) {
      filter.country = country;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { dianCode: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [states, total] = await Promise.all([
      State.find(filter)
        .populate('country', 'name sortname')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      State.countDocuments(filter)
    ]);

    res.json({
      data: states,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener un estado por ID
export const getStateById = async (req, res) => {
  try {
    const state = await State.findById(req.params.id).populate('country', 'name sortname');
    if (!state) {
      return res.status(404).json({ message: "Estado no encontrado" });
    }
    res.json(state);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear un nuevo estado
export const createState = async (req, res) => {
  try {
    const newState = await State.create(req.body);
    await newState.populate('country', 'name sortname');
    res.status(201).json(newState);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Actualizar un estado
export const updateState = async (req, res) => {
  try {
    const updatedState = await State.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('country', 'name sortname');
    if (!updatedState) {
      return res.status(404).json({ message: "Estado no encontrado" });
    }
    res.json(updatedState);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar un estado
export const deleteState = async (req, res) => {
  try {
    const deletedState = await State.findByIdAndDelete(req.params.id);
    if (!deletedState) {
      return res.status(404).json({ message: "Estado no encontrado" });
    }
    res.json({ message: "Estado eliminado exitosamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
