const mongoose = require('mongoose');
const Publication = require('../models/Publication');
const Faculty = require('../models/Faculty');
const ResearchDomain = require('../models/ResearchDomain');

/**
 * Helper to find publication by MongoDB _id or custom publicationCode
 */
const findPublicationByIdOrCode = async (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    const pub = await Publication.findById(id)
      .populate('facultyIds', 'name email department designation')
      .populate('researchDomains', 'name');
    if (pub) return pub;
  }
  return await Publication.findOne({ publicationCode: id })
    .populate('facultyIds', 'name email department designation')
    .populate('researchDomains', 'name');
};

/**
 * Service to fetch publications with filtering and pagination
 */
const getPublications = async (queryParams) => {
  const { year, source, facultyId, researchDomain, search, type } = queryParams;

  // Pagination defaults
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(queryParams.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = {};

  // Filter by year
  if (year && !isNaN(year)) {
    filter.year = parseInt(year, 10);
  }

  // Filter by source
  if (source && source.trim() !== '') {
    filter.source = { $regex: source.trim(), $options: 'i' };
  }

  // Filter by type
  if (type && type.trim() !== '') {
    filter.publicationType = { $regex: type.trim(), $options: 'i' };
  }

  // Filter by facultyId (ObjectId or facultyCode)
  if (facultyId && facultyId.trim() !== '') {
    const trimmedFacultyId = facultyId.trim();
    if (mongoose.Types.ObjectId.isValid(trimmedFacultyId)) {
      filter.facultyIds = trimmedFacultyId;
    } else {
      // Find faculty by facultyCode
      const faculty = await Faculty.findOne({ facultyCode: trimmedFacultyId });
      if (faculty) {
        filter.facultyIds = faculty._id;
      } else {
        // Force empty match if facultyCode doesn't exist
        filter.facultyIds = new mongoose.Types.ObjectId();
      }
    }
  }

  // Filter by researchDomain (name or domain id)
  if (researchDomain && researchDomain.trim() !== '') {
    const domainQuery = researchDomain.trim();
    const matchingDomains = await ResearchDomain.find({
      name: { $regex: domainQuery, $options: 'i' }
    });
    const domainIds = matchingDomains.map(d => d._id);

    filter.$or = [
      ...(domainIds.length > 0 ? [{ researchDomains: { $in: domainIds } }] : []),
      { keywords: { $regex: domainQuery, $options: 'i' } }
    ];
  }

  // Search across title, abstract, authors, keywords, venue, journal, conference
  if (search && search.trim() !== '') {
    const searchRegex = new RegExp(search.trim(), 'i');
    const searchConditions = [
      { title: searchRegex },
      { abstract: searchRegex },
      { authors: searchRegex },
      { keywords: searchRegex },
      { venue: searchRegex },
      { journal: searchRegex },
      { conference: searchRegex }
    ];

    if (filter.$or) {
      // If researchDomain filter was also used, combine with $and
      filter.$and = [
        { $or: filter.$or },
        { $or: searchConditions }
      ];
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  const total = await Publication.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const publications = await Publication.find(filter)
    .populate('facultyIds', 'name email department designation')
    .populate('researchDomains', 'name')
    .sort({ year: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    data: publications,
    pagination: {
      page,
      limit,
      total,
      pages: totalPages
    }
  };
};

/**
 * Service to get single publication by ID
 */
const getPublicationById = async (id) => {
  return await findPublicationByIdOrCode(id);
};

/**
 * Service to create a new publication
 */
const createPublication = async (data) => {
  // Support single facultyId or array facultyIds
  if (data.facultyId && (!data.facultyIds || data.facultyIds.length === 0)) {
    if (mongoose.Types.ObjectId.isValid(data.facultyId)) {
      data.facultyIds = [data.facultyId];
    } else {
      const faculty = await Faculty.findOne({ facultyCode: data.facultyId });
      if (faculty) {
        data.facultyIds = [faculty._id];
      }
    }
  }

  const publication = await Publication.create(data);
  return await publication.populate([
    { path: 'facultyIds', select: 'name email department designation' },
    { path: 'researchDomains', select: 'name' }
  ]);
};

/**
 * Service to update an existing publication
 */
const updatePublication = async (id, updateData) => {
  const existingPub = await findPublicationByIdOrCode(id);
  if (!existingPub) return null;

  // Support single facultyId update
  if (updateData.facultyId && (!updateData.facultyIds || updateData.facultyIds.length === 0)) {
    if (mongoose.Types.ObjectId.isValid(updateData.facultyId)) {
      updateData.facultyIds = [updateData.facultyId];
    } else {
      const faculty = await Faculty.findOne({ facultyCode: updateData.facultyId });
      if (faculty) {
        updateData.facultyIds = [faculty._id];
      }
    }
  }

  const updated = await Publication.findByIdAndUpdate(
    existingPub._id,
    updateData,
    { new: true, runValidators: true }
  ).populate([
    { path: 'facultyIds', select: 'name email department designation' },
    { path: 'researchDomains', select: 'name' }
  ]);

  return updated;
};

/**
 * Service to delete a publication
 */
const deletePublication = async (id) => {
  const existingPub = await findPublicationByIdOrCode(id);
  if (!existingPub) return null;

  await Publication.findByIdAndDelete(existingPub._id);
  return true;
};

module.exports = {
  getPublications,
  getPublicationById,
  createPublication,
  updatePublication,
  deletePublication
};
