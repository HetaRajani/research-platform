const mongoose = require('mongoose');
const models = require('../models');

/**
 * @desc    Health check endpoint
 * @route   GET /api/health
 * @access  Public
 */
const getHealthStatus = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Research Analytics API is running'
  });
};

/**
 * @desc    Database connectivity and models check endpoint
 * @route   GET /api/health/db or GET /api/db-check
 * @access  Public
 */
const getDatabaseHealth = (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;

  res.status(isConnected ? 200 : 503).json({
    success: isConnected,
    message: isConnected ? 'MongoDB connection is active' : 'MongoDB connection is inactive',
    database: {
      status: isConnected ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
      name: mongoose.connection.name,
      host: mongoose.connection.host
    },
    modelsLoaded: Object.keys(models)
  });
};

module.exports = {
  getHealthStatus,
  getDatabaseHealth
};
