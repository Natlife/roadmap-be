const authService = require('../services/authService');
const { successResponse } = require('../utils/baseResponse');
const { asyncHandler } = require('../middleware/error');

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  res.json(successResponse(data, 'Login successful'));
});

const register = asyncHandler(async (req, res) => {
  const data = await authService.register(req.body);
  res.json(successResponse(data, 'User registered successfully'));
});

const getMe = asyncHandler(async (req, res) => {
  const data = await authService.getProfile(req.userId);
  res.json(successResponse(data, 'Get my profile successfully'));
});

module.exports = { login, register, getMe };
