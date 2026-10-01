const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const Publication = require('../models/Publication');
const ResearchDomain = require('../models/ResearchDomain');
const Collaboration = require('../models/Collaboration');

const idString = value => value ? String(value._id || value) : '';

const parseDomainReference = reference => {
  if (typeof reference === 'string') {
    const value = reference.trim();
    if (!value) return null;
    return mongoose.isValidObjectId(value)
      ? { id: value }
      : { name: value };
  }

  if (!reference || typeof reference !== 'object') return null;
  if (typeof reference.name === 'string' && reference.name.trim()) {
    return { name: reference.name.trim() };
  }

  const id = reference._id || reference;
  return mongoose.isValidObjectId(id) ? { id: idString(id) } : null;
};

const getCollaboratorRecommendations = async facultyId => {
  const target = await Faculty.findById(facultyId).select('_id name').lean();
  if (!target) return null;

  const publications = await Publication.find({
    isDuplicate: { $ne: true }
  })
    .select('facultyIds researchDomains predictedResearchDomains.domain predictedResearchDomains.name isDuplicate')
    .lean();

  const activePublications = (publications || []).filter(publication => publication && publication.isDuplicate !== true);
  const domainIds = new Set();

  for (const publication of activePublications) {
    for (const reference of publication.researchDomains || []) {
      const parsed = parseDomainReference(reference);
      if (parsed?.id) domainIds.add(parsed.id);
    }
    for (const prediction of publication.predictedResearchDomains || []) {
      if (typeof prediction?.name === 'string' && prediction.name.trim()) continue;
      const parsed = parseDomainReference(prediction?.domain);
      if (parsed?.id) domainIds.add(parsed.id);
    }
  }

  const domainDocuments = domainIds.size
    ? await ResearchDomain.find({ _id: { $in: [...domainIds] } }).select('_id name').lean()
    : [];
  const domainNamesById = new Map((domainDocuments || []).map(domain => [idString(domain._id), domain.name]));
  const facultyDomains = new Map();

  const addFacultyDomain = (facultyId, name, source) => {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!facultyId || !normalizedName) return;

    const domainKey = normalizedName.toLowerCase();
    if (!facultyDomains.has(facultyId)) facultyDomains.set(facultyId, new Map());
    const domains = facultyDomains.get(facultyId);
    if (!domains.has(domainKey)) {
      domains.set(domainKey, { name: normalizedName, sources: new Set() });
    }
    domains.get(domainKey).sources.add(source);
  };

  for (const publication of activePublications) {
    const publicationFacultyIds = [...new Set((publication.facultyIds || []).map(idString).filter(Boolean))];
    if (!publicationFacultyIds.length) continue;

    const manualDomains = (publication.researchDomains || [])
      .map(parseDomainReference)
      .filter(Boolean)
      .map(reference => reference.name || domainNamesById.get(reference.id))
      .filter(Boolean);
    const predictedDomains = (publication.predictedResearchDomains || [])
      .map(prediction => {
        const name = typeof prediction?.name === 'string' ? prediction.name.trim() : '';
        if (name) return name;
        const reference = parseDomainReference(prediction?.domain);
        return reference?.name || domainNamesById.get(reference?.id);
      })
      .filter(Boolean);

    for (const publicationFacultyId of publicationFacultyIds) {
      for (const domain of manualDomains) addFacultyDomain(publicationFacultyId, domain, 'manual');
      for (const domain of predictedDomains) addFacultyDomain(publicationFacultyId, domain, 'predicted');
    }
  }

  const targetId = idString(target._id);
  const targetDomains = facultyDomains.get(targetId) || new Map();
  const candidateMatches = [];

  for (const [candidateId, candidateDomains] of facultyDomains.entries()) {
    if (candidateId === targetId) continue;

    const sharedDomainDetails = [];
    for (const [domainKey, targetDomain] of targetDomains.entries()) {
      const candidateDomain = candidateDomains.get(domainKey);
      if (!candidateDomain) continue;
      sharedDomainDetails.push({
        name: targetDomain.name,
        targetSources: [...targetDomain.sources].sort(),
        candidateSources: [...candidateDomain.sources].sort()
      });
    }

    if (sharedDomainDetails.length) {
      sharedDomainDetails.sort((domainA, domainB) => domainA.name.localeCompare(domainB.name));
      candidateMatches.push({ candidateId, sharedDomainDetails });
    }
  }

  if (!candidateMatches.length) return [];

  const candidateIds = candidateMatches.map(candidate => candidate.candidateId);
  const [candidateFaculty, existingCollaborations] = await Promise.all([
    Faculty.find({ _id: { $in: candidateIds } }).select('_id name').lean(),
    Collaboration.find({
      $or: [{ faculty1: target._id }, { faculty2: target._id }]
    }).select('faculty1 faculty2 publicationCount').lean()
  ]);

  const existingCollaborationsById = new Map();
  for (const collaboration of existingCollaborations || []) {
    const firstId = idString(collaboration.faculty1);
    const secondId = idString(collaboration.faculty2);
    const candidateId = firstId === targetId ? secondId : secondId === targetId ? firstId : null;
    if (!candidateId) continue;

    const publicationCount = Number(collaboration.publicationCount);
    const safePublicationCount = Number.isFinite(publicationCount) ? Math.max(0, publicationCount) : 0;
    existingCollaborationsById.set(
      candidateId,
      Math.max(existingCollaborationsById.get(candidateId) || 0, safePublicationCount)
    );
  }

  const facultyById = new Map((candidateFaculty || []).map(faculty => [idString(faculty._id), faculty]));
  return candidateMatches
    .map(({ candidateId, sharedDomainDetails }) => {
      const candidate = facultyById.get(candidateId);
      if (!candidate) return null;
      const sharedDomains = sharedDomainDetails.map(domain => domain.name);
      const existingCollaboration = existingCollaborationsById.has(candidateId);
      const domainList = sharedDomains.join(', ');
      return {
        facultyId: candidateId,
        name: candidate.name,
        score: sharedDomainDetails.length,
        sharedDomains,
        sharedDomainCount: sharedDomains.length,
        sharedDomainDetails,
        reason: 'Shared research domains',
        existingCollaboration,
        collaborationCount: existingCollaborationsById.get(candidateId) || 0,
        recommendationReason: existingCollaboration
          ? `Shares research domains (${domainList}) and has an existing collaboration.`
          : `Shares research domains (${domainList}) but has no recorded collaboration.`
      };
    })
    .filter(Boolean)
    .sort((candidateA, candidateB) =>
      candidateB.score - candidateA.score || candidateA.name.localeCompare(candidateB.name)
    );
};

module.exports = {
  getCollaboratorRecommendations
};