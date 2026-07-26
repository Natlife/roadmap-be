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
  });
  // Backward-compatible: `data` stays a plain array; pagination meta is added
  // alongside for clients that want it.
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

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(requester(req), req.params.id, req.body);
  res.json(successResponse(user, 'User updated successfully'));
});

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(requester(req), req.params.id);
  res.json(successResponse(null, 'User deleted successfully'));
});

module.exports = { getAllUsers, getUserById, updateUser, deleteUser };
