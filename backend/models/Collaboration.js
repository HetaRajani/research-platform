const mongoose = require('mongoose');

const CollaborationSchema = new mongoose.Schema({
  faculty1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: [true, 'First faculty reference is required']
  },
  faculty2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: [true, 'Second faculty reference is required']
  },
  publicationCount: {
    type: Number,
    default: 0,
    min: [0, 'Publication count cannot be negative']
  },
  commonDomains: [{
    type: String,
    trim: true
  }],
  collaborationStrength: {
    type: Number,
    default: 0,
    min: [0, 'Collaboration strength cannot be negative'],
    max: [100, 'Collaboration strength maximum is 100']
  },
  lastCollaboration: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index to quickly query collaborations for either faculty member
CollaborationSchema.index({ faculty1: 1, faculty2: 1 }, { unique: true });

module.exports = mongoose.model('Collaboration', CollaborationSchema);
