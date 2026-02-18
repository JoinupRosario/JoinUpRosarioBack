import Skill from "./skill.schema.js";

/**
 * GET /skills
 * Lista todas las habilidades/competencias para selects.
 */
export const getSkills = async (req, res) => {
  try {
    const list = await Skill.find({}).sort({ name: 1 }).select("_id name").lean();
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
