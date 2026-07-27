const { ApiError } = require('../middleware/error');

// ---- domain constants -------------------------------------------------------
const ROLES = ['ADMIN', 'USER'];
const PLANS = ['FREE', 'PREMIUM', 'GROUP'];
const ROLE_IDS = { ADMIN: 1, USER: 2 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}
function normalizePlan(plan) {
  return String(plan || '').trim().toUpperCase();
}

// Resolve the numeric role_id from either a role name or an explicit roleId.
function resolveRoleId(role, roleId) {
  if (roleId !== undefined && roleId !== null && `${roleId}`.trim() !== '') {
    const id = Number(roleId);
    if (id === 1 || id === 2) return id;
  }
  const r = normalizeRole(role);
  return ROLE_IDS[r]; // undefined if not a known role
}

// ---- field-level validation collector --------------------------------------
class FieldErrors {
  constructor() {
    this.errors = {};
  }
  add(field, message) {
    if (!this.errors[field]) this.errors[field] = message;
    return this;
  }
  get isEmpty() {
    return Object.keys(this.errors).length === 0;
  }
  throwIfAny() {
    if (!this.isEmpty) throw ApiError.badRequest('Validation failed', { fields: this.errors });
  }
}

// ---- create ----------------------------------------------------------------
function validateCreateUser(body) {
  const fe = new FieldErrors();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim();
  const rawUsername = body.username !== undefined && body.username !== null ? String(body.username).trim() : '';
  const username = rawUsername || (email.includes('@') ? email.split('@')[0] : '');
  const role = normalizeRole(body.role) || 'USER';
  const plan = normalizePlan(body.plan) || 'FREE';

  if (!email) fe.add('email', 'Email is required');
  else if (!EMAIL_RE.test(email)) fe.add('email', 'Email is invalid');

  if (!password) fe.add('password', 'Password is required');
  else if (password.length < 6) fe.add('password', 'Password must be at least 6 characters');

  if (!fullName) fe.add('fullName', 'Full name is required');
  else if (fullName.length > 120) fe.add('fullName', 'Full name is too long (max 120)');

  if (!username) fe.add('username', 'Username is required');
  else if (username.length < 3) fe.add('username', 'Username must be at least 3 characters');
  else if (username.length > 60) fe.add('username', 'Username is too long (max 60)');
  else if (!USERNAME_RE.test(username)) fe.add('username', 'Username may only contain letters, numbers, . _ -');

  const roleId = resolveRoleId(role, body.roleId);
  if (!roleId) fe.add('role', `Role must be one of: ${ROLES.join(', ')}`);
  if (!PLANS.includes(plan)) fe.add('plan', `Plan must be one of: ${PLANS.join(', ')}`);

  fe.throwIfAny();
  return { email, password, fullName, username, roleId, plan };
}

// ---- update (partial) ------------------------------------------------------
function validateUpdateUser(body) {
  const fe = new FieldErrors();
  const out = {};

  if (body.fullName !== undefined) {
    const fullName = String(body.fullName || '').trim();
    if (!fullName) fe.add('fullName', 'Full name cannot be empty');
    else if (fullName.length > 120) fe.add('fullName', 'Full name is too long (max 120)');
    else out.fullName = fullName;
  }

  if (body.plan !== undefined) {
    const plan = normalizePlan(body.plan);
    if (!PLANS.includes(plan)) fe.add('plan', `Plan must be one of: ${PLANS.join(', ')}`);
    else out.plan = plan;
  }

  if (body.role !== undefined || body.roleId !== undefined) {
    const roleId = resolveRoleId(body.role, body.roleId);
    if (!roleId) fe.add('role', `Role must be one of: ${ROLES.join(', ')}`);
    else out.roleId = roleId;
  }

  if (body.active !== undefined) {
    out.active = toBool(body.active) ? 1 : 0;
  }

  if (body.password !== undefined && body.password !== null && `${body.password}` !== '') {
    const password = String(body.password);
    if (password.length < 6) fe.add('password', 'Password must be at least 6 characters');
    else out.password = password;
  }

  fe.throwIfAny();
  return out;
}

// Accept true/false, 1/0, "1"/"0", "true"/"false".
function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'active';
}

module.exports = {
  ROLES,
  PLANS,
  ROLE_IDS,
  resolveRoleId,
  normalizeRole,
  normalizePlan,
  toBool,
  validateCreateUser,
  validateUpdateUser,
};
