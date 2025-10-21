import Parameter from "./parameter.model.js";

// Obtener todos los parámetros
export const getParameters = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const filter = {};
    
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } }
      ];
    }

    const parameters = await Parameter.find(filter)
      .populate("createdBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "metadata.order": 1, name: 1 });

    const total = await Parameter.countDocuments(filter);

    res.json({
      parameters,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener parámetros por categoría
export const getParametersByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    const parameters = await Parameter.find({ 
      category,
      "metadata.active": true 
    })
    .populate("createdBy", "name email")
    .sort({ "metadata.order": 1, name: 1 });

    res.json(parameters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener parámetro por ID
export const getParameterById = async (req, res) => {
  try {
    const parameter = await Parameter.findById(req.params.id)
      .populate("createdBy", "name email");

    if (!parameter) {
      return res.status(404).json({ message: "Parámetro no encontrado" });
    }

    res.json(parameter);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nuevo parámetro
export const createParameter = async (req, res) => {
  try {
    const parameter = await Parameter.create({
      ...req.body,
      createdBy: req.user.id
    });

    await parameter.populate("createdBy", "name email");

    res.status(201).json(parameter);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Ya existe un parámetro con este código" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Actualizar parámetro
export const updateParameter = async (req, res) => {
  try {
    const parameter = await Parameter.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("createdBy", "name email");

    if (!parameter) {
      return res.status(404).json({ message: "Parámetro no encontrado" });
    }

    res.json(parameter);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Ya existe un parámetro con este código" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Eliminar parámetro
export const deleteParameter = async (req, res) => {
  try {
    const parameter = await Parameter.findByIdAndDelete(req.params.id);
    
    if (!parameter) {
      return res.status(404).json({ message: "Parámetro no encontrado" });
    }

    res.json({ message: "Parámetro eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
