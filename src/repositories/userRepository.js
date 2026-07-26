const pool = require('../config/db');

const USER_SELECT = `
  u.id, u.email, u.user_name AS username, u.full_name AS fullName, u.plan, u.active,
  u.streak_days AS streakDays, u.completed_steps_count AS completedStepsCount,
  r.name AS role`;

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

async function existsByEmail(email, db = pool) {
  const [rows] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return rows.length > 0;
}

async function insertUser({ email, userName, passwordHash, fullName, roleId = 2, plan = 'FREE' }, db = pool) {
  const [result] = await db.query(
    `INSERT INTO users (email, user_name, password, full_name, role_id, plan, active, status)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
    [email, userName, passwordHash, fullName, roleId, plan]
  );
  return result.insertId;
}

async function listUsers({ limit, offset }, db = pool) {
  const [rows] = await db.query(
    `SELECT ${USER_SELECT}
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

async function countUsers(db = pool) {
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM users');
  return Number(rows[0]?.total || 0);
}

async function updateUserProfile(id, { fullName, plan, active }, db = pool) {
  await db.query(
    `UPDATE users
        SET full_name = COALESCE(?, full_name),
            plan      = COALESCE(?, plan),
            active    = COALESCE(?, active)
      WHERE id = ?`,
    [fullName ?? null, plan ?? null, active ?? null, id]
  );
}

async function deleteUser(id, db = pool) {
  await db.query('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = {
  findByLoginIdentifier,
  findByIdWithRole,
  findGroupsForUser,
  existsByEmail,
  insertUser,
  listUsers,
  countUsers,
  updateUserProfile,
  deleteUser,
};
