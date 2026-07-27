const bcrypt = require('bcryptjs');
const userRepo = require('../repositories/userRepository');
const { ApiError } = require('../middleware/error');
const { normalizeRoleName } = require('../middleware/auth');
const {
  ROLE_IDS,
  PLANS,
  resolveRoleId,
  normalizePlan,
  validateCreateUser,
  validateUpdateUser,
} = require('../utils/userValidation');

const BCRYPT_ROUNDS = 10;

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
    roleId: row.roleId ?? row.role_id ?? null,
    groupIds: groups.map((g) => g.id),
    groups,
  };
}

function isAdmin(requester) {
  return normalizeRoleName(requester.role) === 'ADMIN';
}

function assertCanAccess(requester, targetUserId) {
  if (!isAdmin(requester) && String(requester.id) !== String(targetUserId)) {
    throw ApiError.forbidden('Forbidden: insufficient permissions');
  }
}

// ------------------------------------------------------------------ list ----
async function listUsers({ page = 1, pageSize = 20, search, role, plan, status, sortBy, sortOrder } = {}) {
  const safeSize = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeSize;

  const roleId = role ? ROLE_IDS[String(role).toUpperCase()] : undefined;
  const planFilter = plan && PLANS.includes(normalizePlan(plan)) ? normalizePlan(plan) : undefined;
  const s = status ? String(status).toLowerCase() : 'all';
  const active = s === 'active' ? 1 : s === 'inactive' ? 0 : undefined;
  const searchTerm = search ? String(search).trim() : undefined;

  const filters = { search: searchTerm, roleId, plan: planFilter, active };

  const [rows, total] = await Promise.all([
    userRepo.listUsers({ limit: safeSize, offset, sortBy, sortOrder, ...filters }),
    userRepo.countUsers(filters),
  ]);

  const items = [];
  for (const row of rows) items.push(await mapUser(row));

  return { items, page: safePage, pageSize: safeSize, total, totalPages: Math.ceil(total / safeSize) };
}

async function getUser(requester, id) {
  assertCanAccess(requester, id);
  const row = await userRepo.findByIdWithRole(id);
  if (!row) throw ApiError.notFound('User not found');
  return mapUser(row);
}

// ---------------------------------------------------------------- create ----
async function createUser(requester, body) {
  // Only admins reach this (route is admin-guarded), but keep it explicit.
  if (!isAdmin(requester)) throw ApiError.forbidden('Only admins can create users');

  const data = validateCreateUser(body);

  if (await userRepo.existsByEmail(data.email)) {
    throw ApiError.conflict('Email already registered');
  }
  if (await userRepo.existsByUsername(data.username)) {
    throw ApiError.conflict('Username already taken');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const id = await userRepo.insertUser({
    email: data.email,
    userName: data.username,
    passwordHash,
    fullName: data.fullName,
    roleId: data.roleId,
    plan: data.plan,
    active: 1,
  });

  const row = await userRepo.findByIdWithRole(id);
  return mapUser(row);
}

// ---------------------------------------------------------------- update ----
async function updateUser(requester, id, body) {
  assertCanAccess(requester, id);

  const target = await userRepo.findByIdWithRole(id);
  if (!target) throw ApiError.notFound('User not found');

  // Non-admins may only edit their own profile, and only safe fields.
  const admin = isAdmin(requester);
  const isSelf = String(requester.id) === String(id);
  const changes = validateUpdateUser(body);

  if (!admin) {
    // A standard user cannot change role/plan/active for anyone (incl. self).
    delete changes.roleId;
    delete changes.plan;
    delete changes.active;
  }

  const targetIsAdmin = normalizeRoleName(target.role) === 'ADMIN';
  const willDemote = changes.roleId !== undefined && changes.roleId !== ROLE_IDS.ADMIN && targetIsAdmin;
  const willDeactivate = changes.active === 0 && Boolean(target.active);

  // --- guardrails ---
  if (isSelf && willDeactivate) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (isSelf && willDemote) {
    throw ApiError.badRequest('You cannot remove your own admin role');
  }
  if (targetIsAdmin && (willDemote || willDeactivate)) {
    const otherAdmins = await userRepo.countActiveAdmins(id);
    if (otherAdmins === 0) {
      throw ApiError.badRequest('Cannot demote or deactivate the last active admin');
    }
  }

  const patch = {
    fullName: changes.fullName,
    plan: changes.plan,
    active: changes.active,
    roleId: changes.roleId,
  };
  if (changes.password) {
    patch.passwordHash = await bcrypt.hash(changes.password, BCRYPT_ROUNDS);
  }

  await userRepo.updateUser(id, patch);
  const row = await userRepo.findByIdWithRole(id);
  return mapUser(row);
}

// ---------------------------------------------------------------- delete ----
// Hard delete (permanent). Soft delete is done via updateUser({ active: false }).
async function deleteUser(requester, id) {
  if (!isAdmin(requester)) throw ApiError.forbidden('Only admins can delete users');

  const target = await userRepo.findByIdWithRole(id);
  if (!target) throw ApiError.notFound('User not found');

  if (String(requester.id) === String(id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  if (normalizeRoleName(target.role) === 'ADMIN') {
    const otherAdmins = await userRepo.countActiveAdmins(id);
    if (otherAdmins === 0) {
      throw ApiError.badRequest('Cannot delete the last active admin');
    }
  }

  await userRepo.deleteUser(id);
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser };
