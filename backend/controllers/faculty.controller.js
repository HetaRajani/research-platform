const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');

/**
 * Helper to find faculty by MongoDB _id or custom facultyCode
 */
const findFacultyByIdOrCode = async (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    const faculty = await Faculty.findById(id);
    if (faculty) return faculty;
  }
  return await Faculty.findOne({ facultyCode: id });
};

/**
 * @desc    Get all faculty members with optional department filter and multi-field search
 * @route   GET /api/faculty
 * @access  Public
 */
const getFaculty = async (req, res, next) => {
  try {
    const { department, search } = req.query;
    const filter = {};

    if (department && department.trim() !== '') {
      filter.department = { $regex: department.trim(), $options: 'i' };
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      const searchConditions = [
        { name: searchRegex },
        { department: searchRegex },
        { researchInterests: searchRegex }
      ];

      if (filter.department) {
        filter.$and = [
          { department: filter.department },
          { $or: searchConditions }
        ];
        delete filter.department;
      } else {
        filter.$or = searchConditions;
      }
    }

    const facultyList = await Faculty.find(filter).sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: facultyList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single faculty member by ID or facultyCode
 * @route   GET /api/faculty/:id
 * @access  Public
 */
const getFacultyById = async (req, res, next) => {
  try {
    const faculty = await findFacultyByIdOrCode(req.params.id);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: 'Faculty member not found'
      });
    }

    res.status(200).json({
      success: true,
      data: faculty
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new faculty member
 * @route   POST /api/faculty
 * @access  Private (Admin only)
 */
const createFaculty = async (req, res, next) => {
  try {
    const faculty = await Faculty.create(req.body);

    res.status(201).json({
      success: true,
      data: faculty
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a faculty member by ID or facultyCode
 * @route   PUT /api/faculty/:id
 * @access  Private (Admin or owner Faculty)
 */
const updateFaculty = async (req, res, next) => {
  try {
    const faculty = await findFacultyByIdOrCode(req.params.id);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: 'Faculty member not found'
      });
    }

    // Role check: Faculty role can ONLY update their own faculty profile
    if (req.user && req.user.role !== 'admin') {
      const userFacultyId = req.user.facultyId ? req.user.facultyId.toString() : null;
      if (!userFacultyId || userFacultyId !== faculty._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to modify another faculty member\'s data'
        });
      }
    }

    const updatedFaculty = await Faculty.findByIdAndUpdate(
      faculty._id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      data: updatedFaculty
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a faculty member by ID or facultyCode
 * @route   DELETE /api/faculty/:id
 * @access  Private (Admin only)
 */
const deleteFaculty = async (req, res, next) => {
  try {
    const faculty = await findFacultyByIdOrCode(req.params.id);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: 'Faculty member not found'
      });
    }

    await Faculty.findByIdAndDelete(faculty._id);

    res.status(200).json({
      success: true,
      data: {
        message: 'Faculty member deleted successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFaculty,
  getFacultyById,
  createFaculty,
  updateFaculty,
  deleteFaculty
};
