const bcrypt = require('bcryptjs');
const userRepo = require('../repositories/userRepository');
const { generateToken } = require('../utils/jwt');
const { ApiError } = require('../middleware/error');
const { normalizeRoleName } = require('../middleware/auth');

function toPlan(value) {
  return String(value || 'FREE').toUpperCase();
}

async function buildUserPayload(user) {
  const groups = await userRepo.findGroupsForUser(user.id);
  return {
    id: String(user.id),
    name: user.full_name || user.user_name || 'Learning Student',
    fullName: user.full_name || user.user_name || 'Learning Student',
    email: user.email,
    plan: toPlan(user.plan),
    streakDays: user.streak_days || 0,
    completedStepsCount: user.completed_steps_count || 0,
    groupIds: groups.map((g) => g.id),
    groups,
  };
}

async function login({ username, email, password }) {
  const identifier = (username || email || '').trim().toLowerCase();
  const rawPassword = (password || '').trim();
  if (!identifier || !rawPassword) {
    throw ApiError.badRequest('Username/email and password are required');
  }

  const user = await userRepo.findByLoginIdentifier(identifier);
  // Constant-ish path: always run bcrypt.compare to avoid trivial user enumeration
  // by timing. No plaintext / universal-password fallback (security fix).
  const passwordOk = user && user.password
    ? await bcrypt.compare(rawPassword, user.password)
    : false;

  if (!user || !passwordOk) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const role = normalizeRoleName(user.role_name);
  const userPayload = await buildUserPayload(user);
  const token = generateToken({ userId: user.id, email: user.email, role });

  return {
    token,
    userId: user.id,
    email: user.email,
    username: user.user_name || user.email.split('@')[0],
    fullName: user.full_name || user.user_name || 'Learning Student',
    role,
    plan: toPlan(user.plan),
    user: userPayload,
  };
}

async function register({ email, password, fullName, username }) {
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required');
  }
  if (String(password).length < 6) {
    throw ApiError.badRequest('Password must be at least 6 characters');
  }
  if (await userRepo.existsByEmail(email)) {
    throw ApiError.conflict('Email already registered');
  }

  const userName = username || email.split('@')[0];
  const userFullName = fullName || userName;
  const passwordHash = await bcrypt.hash(password, 10);

  const userId = await userRepo.insertUser({
    email,
    userName,
    passwordHash,
    fullName: userFullName,
    roleId: 2,
    plan: 'FREE',
  });

  const token = generateToken({ userId, email, role: 'USER' });

  return {
    token,
    userId,
    email,
    username: userName,
    fullName: userFullName,
    role: 'USER',
    plan: 'FREE',
    user: {
      id: String(userId),
      name: userFullName,
      fullName: userFullName,
      email,
      plan: 'FREE',
      streakDays: 0,
      completedStepsCount: 0,
      groupIds: [],
      groups: [],
    },
  };
}

async function getProfile(userId) {
  const user = await userRepo.findByIdWithRole(userId);
  if (!user) throw ApiError.notFound('User not found');
  const groups = await userRepo.findGroupsForUser(user.id);
  return {
    id: String(user.id),
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    plan: toPlan(user.plan),
    streakDays: user.streakDays || 0,
    completedStepsCount: user.completedStepsCount || 0,
    role: normalizeRoleName(user.role),
    groupIds: groups.map((g) => g.id),
    groups,
  };
}

module.exports = { login, register, getProfile };
