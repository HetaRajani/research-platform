const mongoose = require('mongoose');

const FacultySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Faculty name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Faculty email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
  },
  designation: {
    type: String,
    required: [true, 'Designation is required'],
    trim: true
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    trim: true
  },
  institution: {
    type: String,
    default: 'Charotar University of Science and Technology',
    trim: true
  },
  profileImage: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: '',
    trim: true
  },
  researchInterests: [{
    type: String,
    trim: true
  }],
  skills: [{
    type: String,
    trim: true
  }],
  googleScholarId: {
    type: String,
    default: '',
    trim: true
  },
  scopusId: {
    type: String,
    default: '',
    trim: true
  },
  orcidId: {
    type: String,
    default: '',
    trim: true
  },
  hIndex: {
    type: Number,
    default: 0,
    min: [0, 'h-index cannot be negative']
  },
  i10Index: {
    type: Number,
    default: 0,
    min: [0, 'i10-index cannot be negative']
  },
  citationCount: {
    type: Number,
    default: 0,
    min: [0, 'Citations count cannot be negative']
  },
  publicationCount: {
    type: Number,
    default: 0,
    min: [0, 'Publication count cannot be negative']
  },
  // Optional code to easily correlate with legacy sample datasets (e.g. F001)
  facultyCode: {
    type: String,
    sparse: true,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Faculty', FacultySchema);
