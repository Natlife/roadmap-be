const pool = require('../config/db');

async function createPlanRequest({ userId, name, phone, content }, db = pool) {
  let resolvedUserId = userId || null;

  if (!resolvedUserId && phone) {
    const [userRows] = await db.query(
      `SELECT id FROM users WHERE user_name = ? OR email = ? LIMIT 1`,
      [phone.trim(), phone.trim()]
    );
    if (userRows[0]) {
      resolvedUserId = userRows[0].id;
    }
  }

  const [result] = await db.query(
    `INSERT INTO plan_requests (user_id, name, phone, content, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PENDING', NOW(), NOW())`,
    [resolvedUserId, name, phone, content]
  );
  return result.insertId;
}

async function findPlanRequestsByUser(userId, db = pool) {
  if (!userId) return [];

  const [uRows] = await db.query(
    `SELECT id, full_name, user_name, email FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = uRows[0];
  const userName = user?.full_name || user?.user_name || '';

  // Auto-link any existing unlinked requests matching user_id or matching name/phone
  await db.query(
    `UPDATE plan_requests
        SET user_id = ?
      WHERE user_id IS NULL AND (name = ? AND name != '')`,
    [userId, userName]
  );

  const [rows] = await db.query(
    `SELECT id, user_id, name, phone, content, status, admin_note, created_at, updated_at
       FROM plan_requests
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}


async function findAllPlanRequests({ page = 1, limit = 20, status, search }, db = pool) {
  const offset = (page - 1) * limit;
  const whereClauses = [];
  const queryParams = [];

  if (status && status !== 'ALL') {
    whereClauses.push('pr.status = ?');
    queryParams.push(status);
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    whereClauses.push('(pr.name LIKE ? OR pr.phone LIKE ? OR pr.content LIKE ? OR u.email LIKE ?)');
    queryParams.push(q, q, q, q);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM plan_requests pr LEFT JOIN users u ON pr.user_id = u.id ${whereSql}`;
  const [countRows] = await db.query(countSql, queryParams);
  const total = Number(countRows[0]?.total || 0);

  const dataSql = `
    SELECT pr.id, pr.user_id, pr.name, pr.phone, pr.content, pr.status, pr.admin_note, pr.created_at, pr.updated_at,
           u.email AS user_email, u.user_name AS user_username, u.role_id AS user_role_id, u.plan AS user_plan
      FROM plan_requests pr
      LEFT JOIN users u ON pr.user_id = u.id
    ${whereSql}
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await db.query(dataSql, [...queryParams, Number(limit), Number(offset)]);

  return {
    items: rows,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function findPlanRequestById(id, db = pool) {
  const [rows] = await db.query(
    `SELECT pr.*, u.email AS user_email, u.role_id AS user_role_id, u.plan AS user_plan
       FROM plan_requests pr
       LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function updatePlanRequestStatus(id, { status, adminNote }, db = pool) {
  await db.query(
    `UPDATE plan_requests
        SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = NOW()
      WHERE id = ?`,
    [status, adminNote || null, id]
  );
}

module.exports = {
  createPlanRequest,
  findPlanRequestsByUser,
  findAllPlanRequests,
  findPlanRequestById,
  updatePlanRequestStatus,
};
