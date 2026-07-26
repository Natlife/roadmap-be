const pool = require('../config/db');
const { toId } = require('../utils/parse');

/** Categories and Tags share the same simple shape, so one module serves both. */
function makeRepo(table) {
  return {
    async findAll(db = pool) {
      const [rows] = await db.query(`SELECT * FROM ${table} ORDER BY created_at DESC`);
      return rows;
    },
    async findById(id, db = pool) {
      const [rows] = await db.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
      return rows[0] || null;
    },
    async upsert({ id, title, description }, db = pool) {
      const numericId = toId(id);
      if (numericId != null) {
        await db.query(
          `INSERT INTO ${table} (id, title, description, status)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
          [numericId, title, description || '']
        );
        return numericId;
      }
      const [result] = await db.query(
        `INSERT INTO ${table} (title, description, status) VALUES (?, ?, 1)`,
        [title, description || '']
      );
      return result.insertId;
    },
    async update(id, { title, description, status }, db = pool) {
      await db.query(
        `UPDATE ${table}
            SET title = COALESCE(?, title),
                description = COALESCE(?, description),
                status = COALESCE(?, status)
          WHERE id = ?`,
        [title ?? null, description ?? null, status ?? null, id]
      );
    },
    async remove(id, db = pool) {
      await db.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    },
  };
}

module.exports = {
  categories: makeRepo('categories'),
  tags: makeRepo('tags'),
};
