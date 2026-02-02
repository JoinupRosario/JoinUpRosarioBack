import City from "../models/city.schema.js";

// Obtener todas las ciudades
export const getCities = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, state } = req.query;
    const filter = {};

    if (state) {
      filter.state = state;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { codDian: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [cities, total] = await Promise.all([
      City.find(filter)
        .populate({
          path: 'state',
          populate: { path: 'country', select: 'name sortname' }
        })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      City.countDocuments(filter)
    ]);

    res.json({
      data: cities,
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

// Obtener una ciudad por ID
export const getCityById = async (req, res) => {
  try {
    const city = await City.findById(req.params.id)
      .populate({
        path: 'state',
        populate: { path: 'country', select: 'name sortname' }
      });
    if (!city) {
      return res.status(404).json({ message: "Ciudad no encontrada" });
    }
    res.json(city);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear una nueva ciudad
export const createCity = async (req, res) => {
  try {
    const newCity = await City.create(req.body);
    await newCity.populate({
      path: 'state',
      populate: { path: 'country', select: 'name sortname' }
    });
    res.status(201).json(newCity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Actualizar una ciudad
export const updateCity = async (req, res) => {
  try {
    const updatedCity = await City.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate({
      path: 'state',
      populate: { path: 'country', select: 'name sortname' }
    });
    if (!updatedCity) {
      return res.status(404).json({ message: "Ciudad no encontrada" });
    }
    res.json(updatedCity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar una ciudad
export const deleteCity = async (req, res) => {
  try {
    const deletedCity = await City.findByIdAndDelete(req.params.id);
    if (!deletedCity) {
      return res.status(404).json({ message: "Ciudad no encontrada" });
    }
    res.json({ message: "Ciudad eliminada exitosamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
