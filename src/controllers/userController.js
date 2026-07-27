const userService = require('../services/userService');
const { successResponse } = require('../utils/baseResponse');
const { asyncHandler } = require('../middleware/error');

function requester(req) {
  return { id: req.userId, role: req.userRole };
}

const getAllUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers({
    page: req.query.page,
    pageSize: req.query.pageSize,
    search: req.query.search,
    role: req.query.role,
    plan: req.query.plan,
    status: req.query.status,
    sortBy: req.query.sortBy,
    sortOrder: req.query.sortOrder,
  });
  // `data` stays a plain array for backward compatibility; pagination meta rides alongside.
  const payload = successResponse(result.items, 'Get all users successfully');
  payload.meta = {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  };
  res.json(payload);
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUser(requester(req), req.params.id);
  res.json(successResponse(user, 'Get user by ID successfully'));
});

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(requester(req), req.body);
  res.status(201).json(successResponse(user, 'User created successfully'));
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(requester(req), req.params.id, req.body);
  res.json(successResponse(user, 'User updated successfully'));
});

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(requester(req), req.params.id);
  res.json(successResponse(null, 'User deleted successfully'));
});

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser };
