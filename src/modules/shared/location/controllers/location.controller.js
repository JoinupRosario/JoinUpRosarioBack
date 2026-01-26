import Country from "../models/countries.js";
import Department from "../models/departments.js";
import City from "../models/cities.js";

export const getCountries = async (req, res) => {
  try {
    const countries = await Country.find()
      .sort({ name: 1 })
      .lean();

    res.json(countries);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const getDepartmentsByCountry = async (req, res) => {
  try {
    const { countryId } = req.params;

    const departments = await Department.find({
      country: countryId
    })
      .sort({ name: 1 })
      .lean();

    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCitiesByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;

    const cities = await City.find({
      department: departmentId
    })
      .sort({ name: 1 })
      .lean();

    res.json(cities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
