const pool = require('../config/db');

async function searchAuthors(query, db = pool) {
  const searchTerm = `%${query.trim()}%`;
  const [rows] = await db.query(
    `SELECT u.id, u.code, u.user_name AS username, u.full_name AS fullName, u.email, u.description, r.name AS role
       FROM users u
       INNER JOIN roles r ON u.role_id = r.id
      WHERE (r.name IN ('ROLE_AUTHOR', 'AUTHOR') OR u.role_id = 3)
        AND u.active = 1
        AND (u.user_name LIKE ? OR u.full_name LIKE ? OR u.code LIKE ? OR u.email LIKE ?)
      ORDER BY u.id DESC
      LIMIT 50`,
    [searchTerm, searchTerm, searchTerm, searchTerm]
  );
  return rows;
}

async function searchBlogs(query, db = pool) {
  const searchTerm = `%${query.trim()}%`;
  const [rows] = await db.query(
    `SELECT t.*, u.user_name AS author_username, u.full_name AS author_full_name
       FROM topics t
       LEFT JOIN users u ON t.author_id = u.id
      WHERE t.approval_status = 'APPROVED'
        AND (t.code LIKE ? OR t.title LIKE ? OR t.description LIKE ?)
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 50`,
    [searchTerm, searchTerm, searchTerm]
  );
  return rows;
}

async function searchSteps(query, db = pool) {
  const searchTerm = `%${query.trim()}%`;
  const [rows] = await db.query(
    `SELECT s.*, l.title AS lesson_title, t.title AS topic_title,
            u.user_name AS author_username, u.full_name AS author_full_name
       FROM steps s
       LEFT JOIN lessons l ON s.lesson_id = l.id
       LEFT JOIN topics t ON l.topic_id = t.id
       LEFT JOIN users u ON s.author_id = u.id
      WHERE s.approval_status = 'APPROVED'
        AND (s.code LIKE ? OR s.title LIKE ? OR s.summary LIKE ?)
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 50`,
    [searchTerm, searchTerm, searchTerm]
  );
  return rows;
}

async function findAuthorProfile(identifier, db = pool) {
  const isNumeric = /^\d+$/.test(String(identifier));
  const whereClause = isNumeric
    ? '(u.id = ? OR LOWER(u.user_name) = ? OR LOWER(u.code) = ?)'
    : '(LOWER(u.user_name) = ? OR LOWER(u.code) = ?)';
  const lowerIdent = String(identifier).toLowerCase();
  const params = isNumeric ? [identifier, lowerIdent, lowerIdent] : [lowerIdent, lowerIdent];

  const [rows] = await db.query(
    `SELECT u.id, u.code, u.user_name AS username, u.full_name AS fullName, u.email, u.description, r.name AS role
       FROM users u
       INNER JOIN roles r ON u.role_id = r.id
      WHERE ${whereClause}
        AND (r.name IN ('ROLE_AUTHOR', 'AUTHOR') OR u.role_id = 3)
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function findApprovedTopicsByAuthor(authorId, db = pool) {
  const [rows] = await db.query(
    `SELECT t.*, u.user_name AS author_username, u.full_name AS author_full_name
       FROM topics t
       LEFT JOIN users u ON t.author_id = u.id
      WHERE t.author_id = ? AND t.approval_status = 'APPROVED'
      ORDER BY t.created_at DESC, t.id DESC`,
    [authorId]
  );
  return rows;
}

module.exports = {
  searchAuthors,
  searchBlogs,
  searchSteps,
  findAuthorProfile,
  findApprovedTopicsByAuthor,
};
