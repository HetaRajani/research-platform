const mongoose = require('mongoose');

const YearlyGrowthSchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true
  },
  publications: {
    type: Number,
    default: 0,
    min: 0
  },
  citations: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const ResearchDomainSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Research domain name is required'],
    unique: true,
    trim: true
  },
  publicationCount: {
    type: Number,
    default: 0,
    min: [0, 'Publication count cannot be negative']
  },
  citationCount: {
    type: Number,
    default: 0,
    min: [0, 'Citation count cannot be negative']
  },
  facultyCount: {
    type: Number,
    default: 0,
    min: [0, 'Faculty count cannot be negative']
  },
  growthRate: {
    type: Number,
    default: 0
  },
  emergingScore: {
    type: Number,
    default: 0,
    min: [0, 'Emerging score cannot be negative']
  },
  yearlyGrowth: [YearlyGrowthSchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('ResearchDomain', ResearchDomainSchema);
