const service = require('../services/planRequestService');
const { successResponse } = require('../utils/baseResponse');
const { asyncHandler } = require('../middleware/error');

const createRequest = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { name, phone, content } = req.body;
  const result = await service.createRequest({ userId, name, phone, content });
  res.status(201).json(successResponse(result, 'Plan Request submitted successfully'));
});

const getMyRequests = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const requests = await service.getMyRequests(userId);
  res.json(successResponse(requests, 'Fetched my plan requests'));
});

const getAllRequests = asyncHandler(async (req, res) => {
  const { page, limit, status, search } = req.query;
  const result = await service.getAllRequests({ page, limit, status, search });
  res.json(successResponse(result, 'Fetched plan requests'));
});

const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;
  const updated = await service.updateStatus(id, { status, adminNote });
  res.json(successResponse(updated, 'Plan Request updated successfully'));
});

module.exports = {
  createRequest,
  getMyRequests,
  getAllRequests,
  updateStatus,
};
