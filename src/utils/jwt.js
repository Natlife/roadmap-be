const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

function generateToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (_) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken,
};
