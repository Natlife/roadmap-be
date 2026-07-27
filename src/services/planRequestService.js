const repo = require('../repositories/planRequestRepository');
const pool = require('../config/db');
const { ApiError } = require('../middleware/error');

async function createRequest({ userId, name, phone, content }) {
  if (!name || !name.trim()) {
    throw ApiError.badRequest('Full Name is required.');
  }
  if (!phone || !phone.trim()) {
    throw ApiError.badRequest('Phone number is required.');
  }
  if (!content || !content.trim()) {
    throw ApiError.badRequest('Request content is required.');
  }

  const id = await repo.createPlanRequest({
    userId,
    name: name.trim(),
    phone: phone.trim(),
    content: content.trim(),
  });

  return repo.findPlanRequestById(id);
}

async function getMyRequests(userId) {
  return repo.findPlanRequestsByUser(userId);
}

async function getAllRequests(params) {
  return repo.findAllPlanRequests(params);
}

async function updateStatus(id, { status, adminNote }) {
  const allowedStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
  if (!allowedStatuses.includes(status)) {
    throw ApiError.badRequest(`Invalid status: ${status}`);
  }

  const ticket = await repo.findPlanRequestById(id);
  if (!ticket) {
    throw ApiError.notFound('Plan Request ticket not found.');
  }

  await repo.updatePlanRequestStatus(id, { status, adminNote });

  // Auto-upgrade user account to PREMIUM if approved
  if (status === 'APPROVED' && ticket.user_id) {
    await pool.query(
      `UPDATE users
          SET plan = 'PREMIUM', updated_at = NOW()
        WHERE id = ?`,
      [ticket.user_id]
    );
  }

  return repo.findPlanRequestById(id);
}

module.exports = {
  createRequest,
  getMyRequests,
  getAllRequests,
  updateStatus,
};
