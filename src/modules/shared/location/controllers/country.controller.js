import Country from "../models/country.schema.js";

// Obtener todos los países
export const getCountries = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sortname: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [countries, total] = await Promise.all([
      Country.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Country.countDocuments(filter)
    ]);

    res.json({
      data: countries,
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

// Obtener un país por ID
export const getCountryById = async (req, res) => {
  try {
    const country = await Country.findById(req.params.id);
    if (!country) {
      return res.status(404).json({ message: "País no encontrado" });
    }
    res.json(country);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear un nuevo país
export const createCountry = async (req, res) => {
  try {
    const newCountry = await Country.create(req.body);
    res.status(201).json(newCountry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Actualizar un país
export const updateCountry = async (req, res) => {
  try {
    const updatedCountry = await Country.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedCountry) {
      return res.status(404).json({ message: "País no encontrado" });
    }
    res.json(updatedCountry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar un país
export const deleteCountry = async (req, res) => {
  try {
    const deletedCountry = await Country.findByIdAndDelete(req.params.id);
    if (!deletedCountry) {
      return res.status(404).json({ message: "País no encontrado" });
    }
    res.json({ message: "País eliminado exitosamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
