const pool = require('../config/db');

const USER_SELECT = `
  u.id, u.email, u.user_name AS username, u.full_name AS fullName, u.plan, u.active,
  u.streak_days AS streakDays, u.completed_steps_count AS completedStepsCount,
  u.role_id AS roleId, r.name AS role`;

// Columns clients may sort by -> safe SQL expression (whitelist prevents injection).
const SORTABLE = {
  fullName: 'u.full_name',
  email: 'u.email',
  username: 'u.user_name',
  plan: 'u.plan',
  role: 'r.name',
  active: 'u.active',
  createdAt: 'u.created_at',
};

async function findByLoginIdentifier(identifier, db = pool) {
  const [rows] = await db.query(
    `SELECT u.*, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
      WHERE LOWER(u.email) = ? OR LOWER(u.user_name) = ?
      LIMIT 1`,
    [identifier, identifier]
  );
  return rows[0] || null;
}

async function findByIdWithRole(id, db = pool) {
  const [rows] = await db.query(
    `SELECT ${USER_SELECT}
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findGroupsForUser(userId, db = pool) {
  const [rows] = await db.query(
    `SELECT lg.id, lg.title, lg.description, lg.expired_at
       FROM learning_groups lg
       INNER JOIN group_members gm ON gm.group_id = lg.id
      WHERE gm.user_id = ?
      ORDER BY lg.id ASC`,
    [userId]
  );
  return rows.map((g) => ({
    id: String(g.id),
    title: g.title,
    description: g.description || '',
    expiredAt: g.expired_at,
  }));
}

async function existsByEmail(email, excludeId = null, db = pool) {
  const params = [String(email).toLowerCase()];
  let sql = 'SELECT id FROM users WHERE LOWER(email) = ?';
  if (excludeId != null) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await db.query(`${sql} LIMIT 1`, params);
  return rows.length > 0;
}

async function existsByUsername(username, excludeId = null, db = pool) {
  const params = [String(username).toLowerCase()];
  let sql = 'SELECT id FROM users WHERE LOWER(user_name) = ?';
  if (excludeId != null) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await db.query(`${sql} LIMIT 1`, params);
  return rows.length > 0;
}

async function insertUser(
  {
    email,
    userName,
    passwordHash,
    fullName,
    roleId = 2,
    plan = 'FREE',
    active = 1,
    streakDays = 0,
    completedStepsCount = 0,
  },
  db = pool
) {
  const [result] = await db.query(
    `INSERT INTO users (email, user_name, password, full_name, role_id, plan, active, status, streak_days, completed_steps_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      email,
      userName,
      passwordHash,
      fullName,
      roleId,
      plan,
      active ? 1 : 0,
      streakDays ?? 0,
      completedStepsCount ?? 0,
    ]
  );
  return result.insertId;
}

// ---- list / count with optional filters ------------------------------------
function buildFilters({ search, roleId, plan, active }) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(u.email LIKE ? OR u.user_name LIKE ? OR u.full_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (roleId) {
    where.push('u.role_id = ?');
    params.push(roleId);
  }
  if (plan) {
    where.push('u.plan = ?');
    params.push(plan);
  }
  if (active === 0 || active === 1) {
    where.push('u.active = ?');
    params.push(active);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function listUsers({ limit, offset, search, roleId, plan, active, sortBy, sortOrder }, db = pool) {
  const { clause, params } = buildFilters({ search, roleId, plan, active });
  const orderCol = SORTABLE[sortBy] || SORTABLE.createdAt;
  const orderDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const [rows] = await db.query(
    `SELECT ${USER_SELECT}
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       ${clause}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function countUsers({ search, roleId, plan, active } = {}, db = pool) {
  const { clause, params } = buildFilters({ search, roleId, plan, active });
  const [rows] = await db.query(`SELECT COUNT(*) AS total FROM users u ${clause}`, params);
  return Number(rows[0]?.total || 0);
}

// Number of active admins, optionally excluding one user (for last-admin guard).
async function countActiveAdmins(excludeId = null, db = pool) {
  const params = [];
  let sql = 'SELECT COUNT(*) AS total FROM users WHERE role_id = 1 AND active = 1';
  if (excludeId != null) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await db.query(sql, params);
  return Number(rows[0]?.total || 0);
}

// Dynamic partial update. Only the provided fields are written.
async function updateUser(id, { fullName, plan, active, roleId, passwordHash }, db = pool) {
  const sets = [];
  const params = [];
  if (fullName !== undefined) { sets.push('full_name = ?'); params.push(fullName); }
  if (plan !== undefined) { sets.push('plan = ?'); params.push(plan); }
  if (active !== undefined) { sets.push('active = ?'); params.push(active ? 1 : 0); }
  if (roleId !== undefined) { sets.push('role_id = ?'); params.push(roleId); }
  if (passwordHash !== undefined) { sets.push('password = ?'); params.push(passwordHash); }
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function deleteUser(id, db = pool) {
  await db.query('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = {
  findByLoginIdentifier,
  findByIdWithRole,
  findGroupsForUser,
  existsByEmail,
  existsByUsername,
  insertUser,
  listUsers,
  countUsers,
  countActiveAdmins,
  updateUser,
  deleteUser,
};
