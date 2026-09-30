const mongoose = require('mongoose');

const DuplicateReviewSchema = new mongoose.Schema({
  publicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Publication',
    required: [true, 'publicationId is required']
  },
  potentialDuplicateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Publication',
    required: [true, 'potentialDuplicateId is required']
  },
  similarityScore: {
    type: Number,
    required: [true, 'similarityScore is required'],
    min: [0, 'Similarity score cannot be less than 0'],
    max: [1, 'Similarity score cannot be greater than 1']
  },
  confidence: {
    type: String,
    required: [true, 'confidence is required'],
    enum: {
      values: ['high', 'medium', 'low'],
      message: '{VALUE} is not a valid confidence level'
    }
  },
  matchingSignals: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'rejected'],
      message: '{VALUE} is not a valid duplicate review status'
    },
    default: 'pending',
    required: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  // Merge status fields
  merged: {
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
  },
  mergedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Compound and lookup indexes
DuplicateReviewSchema.index({ publicationId: 1, potentialDuplicateId: 1 });
DuplicateReviewSchema.index({ potentialDuplicateId: 1, publicationId: 1 });
DuplicateReviewSchema.index({ status: 1 });
DuplicateReviewSchema.index({ confidence: 1 });

module.exports = mongoose.model('DuplicateReview', DuplicateReviewSchema);
