const mongoose = require('mongoose');

const PublicationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Publication title is required'],
    trim: true
  },
  abstract: {
    type: String,
    default: '',
    trim: true
  },
  authors: [{
    type: String,
    trim: true
  }],
  facultyIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty'
  }],
  year: {
    type: Number,
    required: [true, 'Publication year is required'],
    min: [1900, 'Year cannot be earlier than 1900']
  },
  journal: {
    type: String,
    default: '',
    trim: true
  },
  conference: {
    type: String,
    default: '',
    trim: true
  },
  venue: {
    type: String,
    default: '',
    trim: true
  },
  citations: {
    type: Number,
    default: 0,
    min: [0, 'Citations cannot be negative']
  },
  doi: {
    type: String,
    default: '',
    trim: true
  },
  publicationType: {
    type: String,
    enum: ['Journal', 'Conference', 'Book Chapter', 'Book', 'Patent', 'Preprint', 'Other'],
    default: 'Journal'
  },
  // Existing / manually assigned research domains (verified)
  researchDomains: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ResearchDomain'
  }],
  // Automatically predicted research domains (Phase 12A foundation, Phase 12B enhanced)
  predictedResearchDomains: [{
    domain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResearchDomain'
    },
    name: {
      type: String,
      trim: true
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    matchedKeywords: [{
      type: String,
      trim: true
    }],
    matchedPhrases: [{
      type: String,
      trim: true
    }],
    matchedAcronyms: [{
      type: String,
      trim: true
    }]
  }],
  keywords: [{
    type: String,
    trim: true
  }],
  source: {
    type: String,
    default: 'Manual',
    trim: true
  },
  // Optional code to easily correlate with legacy sample datasets (e.g. P001)
  publicationCode: {
    type: String,
    sparse: true,
    trim: true
  },
  // Soft-merge duplicate tracking fields
  isDuplicate: {
    type: Boolean,
    default: false,
    index: true
  },
  mergedInto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Publication',
    default: null
  },
  mergedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Publication', PublicationSchema);
