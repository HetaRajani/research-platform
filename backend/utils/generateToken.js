const jwt = require('jsonwebtoken');

/**
 * Generate signed JWT token
 * @param {string} id - User ID
 * @returns {string} Signed JWT
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

module.exports = generateToken;
