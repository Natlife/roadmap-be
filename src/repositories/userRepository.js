const pool = require('../config/db');

const USER_SELECT = `
  u.id, u.code, u.email, u.user_name AS username, u.full_name AS fullName, u.description, u.plan, u.active,
  u.streak_days AS streakDays, u.completed_steps_count AS completedStepsCount,
  u.role_id AS roleId, r.name AS role`;


// Columns clients may sort by -> safe SQL expression (whitelist prevents injection).
const SORTABLE = {
  id: 'u.id',
  code: 'u.code',
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
      WHERE LOWER(u.email) = ? OR LOWER(u.user_name) = ? OR LOWER(u.code) = ?
      LIMIT 1`,
    [identifier, identifier, identifier]
  );
  return rows[0] || null;
}

async function findByIdWithRole(id, db = pool) {
  const isNumeric = /^\d+$/.test(String(id));
  const whereClause = isNumeric ? 'u.id = ? OR u.code = ?' : 'u.code = ?';
  const params = isNumeric ? [id, id] : [id];
  const [rows] = await db.query(
    `SELECT ${USER_SELECT}
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
      WHERE ${whereClause}
      LIMIT 1`,
    params
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
    code,
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
    `INSERT INTO users (code, email, user_name, password, full_name, role_id, plan, active, status, streak_days, completed_steps_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      code || null,
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
  const newId = result.insertId;

  if (!code) {
    const generatedCode = `USR-${String(newId).padStart(5, '0')}`;
    await db.query('UPDATE users SET code = ? WHERE id = ?', [generatedCode, newId]);
  }

  return newId;
}

// ---- list / count with optional filters ------------------------------------
function buildFilters({ search, roleId, plan, active }) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(u.email LIKE ? OR u.user_name LIKE ? OR u.full_name LIKE ? OR u.code LIKE ? OR CAST(u.id AS CHAR) = ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like, search);
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
async function updateUser(id, { fullName, description, plan, active, roleId, passwordHash }, db = pool) {
  const sets = [];
  const params = [];
  if (fullName !== undefined) { sets.push('full_name = ?'); params.push(fullName); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description); }
  if (plan !== undefined) { sets.push('plan = ?'); params.push(plan); }
  if (active !== undefined) { sets.push('active = ?'); params.push(active ? 1 : 0); }
  if (roleId !== undefined) { sets.push('role_id = ?'); params.push(roleId); }
  if (passwordHash !== undefined) { sets.push('password = ?'); params.push(passwordHash); }
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function deleteUser(id, db = pool) {
  await db.query('DELETE FROM group_members WHERE user_id = ?', [id]);
  await db.query('DELETE FROM user_step_progress WHERE user_id = ?', [id]);
  await db.query('DELETE FROM plan_requests WHERE user_id = ?', [id]);
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
