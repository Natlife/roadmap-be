const userRepo = require('../repositories/userRepository');
const { ApiError } = require('../middleware/error');
const { normalizeRoleName } = require('../middleware/auth');

async function mapUser(row) {
  const groups = await userRepo.findGroupsForUser(row.id);
  return {
    id: String(row.id),
    email: row.email,
    username: row.username || row.user_name,
    fullName: row.fullName || row.full_name,
    plan: String(row.plan || 'FREE').toUpperCase(),
    active: Boolean(row.active),
    streakDays: row.streakDays ?? row.streak_days ?? 0,
    completedStepsCount: row.completedStepsCount ?? row.completed_steps_count ?? 0,
    role: normalizeRoleName(row.role || row.role_name),
    groupIds: groups.map((g) => g.id),
    groups,
  };
}

function assertCanAccess(requester, targetUserId) {
  const isAdmin = normalizeRoleName(requester.role) === 'ADMIN';
  if (!isAdmin && String(requester.id) !== String(targetUserId)) {
    throw ApiError.forbidden('Forbidden: insufficient permissions');
  }
}

async function listUsers({ page = 1, pageSize = 50 }) {
  const safeSize = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeSize;

  const [rows, total] = await Promise.all([
    userRepo.listUsers({ limit: safeSize, offset }),
    userRepo.countUsers(),
  ]);

  const items = [];
  for (const row of rows) items.push(await mapUser(row));

  return {
    items,
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages: Math.ceil(total / safeSize),
  };
}

async function getUser(requester, id) {
  assertCanAccess(requester, id);
  const row = await userRepo.findByIdWithRole(id);
  if (!row) throw ApiError.notFound('User not found');
  return mapUser(row);
}

async function updateUser(requester, id, body) {
  assertCanAccess(requester, id);
  const plan = body.plan ? String(body.plan).trim().toUpperCase() : null;
  await userRepo.updateUserProfile(id, {
    fullName: body.fullName ?? null,
    plan,
    active: body.active ?? null,
  });
  const row = await userRepo.findByIdWithRole(id);
  if (!row) throw ApiError.notFound('User not found');
  return mapUser(row);
}

async function deleteUser(requester, id) {
  assertCanAccess(requester, id);
  await userRepo.deleteUser(id);
}

module.exports = { listUsers, getUser, updateUser, deleteUser };
