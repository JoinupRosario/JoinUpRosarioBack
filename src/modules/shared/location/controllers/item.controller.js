import Item from "../models/item.schema.js";

// CRUD genérico para Items filtrados por listId
export const getItemsByListId = async (req, res) => {
  try {
    const { listId } = req.params;
    const { search, page = 1, limit = 10, status, isActive } = req.query;
    
    const filter = { listId };
    
    // Filtros opcionales
    if (status) {
      filter.status = status;
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Búsqueda por texto
    if (search) {
      filter.$or = [
        { value: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { valueForReports: { $regex: search, $options: 'i' } },
        { valueForCalculations: { $regex: search, $options: 'i' } }
      ];
      
      // Para L_CIIU, buscar también por los primeros 3 dígitos del código
      if (listId === 'L_CIIU' && /^\d{1,3}$/.test(search)) {
        filter.$or.push({ value: { $regex: `^${search}`, $options: 'i' } });
      }
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const [data, total] = await Promise.all([
      Item.find(filter)
        .sort({ sort: 1, value: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Item.countDocuments(filter)
    ]);
    
    res.json({
      data,
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

export const getItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Item.findById(id);
    
    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }
    
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createItem = async (req, res) => {
  try {
    const { listId, value, description, valueForReports, valueForCalculations, status, sort, filters, isActive, parentId } = req.body;
    
    if (!listId || !value) {
      return res.status(400).json({ message: "listId y value son requeridos" });
    }
    
    const itemData = {
      listId,
      value,
      description: description || null,
      valueForReports: valueForReports || null,
      valueForCalculations: valueForCalculations || null,
      status: status || 'active',
      sort: sort || null,
      filters: filters || null,
      isActive: isActive !== undefined ? isActive : true,
      parentId: parentId || null
    };
    
    const item = await Item.create(itemData);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // No permitir cambiar listId una vez creado
    delete updateData.listId;
    delete updateData.mysqlId; // No permitir cambiar mysqlId
    
    const item = await Item.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }
    
    res.json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Item.findByIdAndDelete(id);
    
    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }
    
    res.json({ message: "Item eliminado exitosamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener todos los listId disponibles (desde dynamic_list o desde items)
export const getAvailableListIds = async (req, res) => {
  try {
    const listIds = await Item.distinct('listId', { listId: { $exists: true, $ne: null } });
    res.json({ listIds: listIds.sort() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
