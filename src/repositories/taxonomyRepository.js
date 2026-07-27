const pool = require('../config/db');
const { toId } = require('../utils/parse');

/**
 * Categories and Tags share the same shape and only differ by their join table
 * (topic_categories / topic_tags). One factory serves both, exposing a
 * `usageCount` = number of topics currently linked to the item.
 */
function makeRepo(table, joinTable, joinKey) {
  const USAGE = `(SELECT COUNT(*) FROM ${joinTable} j WHERE j.${joinKey} = t.id) AS usageCount`;

  return {
    async findAll({ search, status } = {}, db = pool) {
      const where = [];
      const params = [];
      if (search) {
        where.push('(t.title LIKE ? OR t.description LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }
      if (status === 0 || status === 1) {
        where.push('t.status = ?');
        params.push(status);
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [rows] = await db.query(
        `SELECT t.*, ${USAGE} FROM ${table} t ${clause} ORDER BY t.title ASC`,
        params
      );
      return rows;
    },

    async findById(id, db = pool) {
      const [rows] = await db.query(`SELECT t.*, ${USAGE} FROM ${table} t WHERE t.id = ? LIMIT 1`, [id]);
      return rows[0] || null;
    },

    async existsByTitle(title, excludeId = null, db = pool) {
      const params = [String(title).trim().toLowerCase()];
      let sql = `SELECT id FROM ${table} WHERE LOWER(title) = ?`;
      if (excludeId != null) {
        sql += ' AND id <> ?';
        params.push(excludeId);
      }
      const [rows] = await db.query(`${sql} LIMIT 1`, params);
      return rows.length > 0;
    },

    async insert({ title, description = '', status = 1 }, db = pool) {
      const [result] = await db.query(
        `INSERT INTO ${table} (title, description, status) VALUES (?, ?, ?)`,
        [title, description, status]
      );
      return result.insertId;
    },

    // partial dynamic update
    async update(id, { title, description, status }, db = pool) {
      const sets = [];
      const params = [];
      if (title !== undefined) { sets.push('title = ?'); params.push(title); }
      if (description !== undefined) { sets.push('description = ?'); params.push(description); }
      if (status !== undefined) { sets.push('status = ?'); params.push(status); }
      if (!sets.length) return;
      params.push(id);
      await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, params);
    },

    async countUsage(id, db = pool) {
      const [rows] = await db.query(`SELECT COUNT(*) AS total FROM ${joinTable} WHERE ${joinKey} = ?`, [id]);
      return Number(rows[0]?.total || 0);
    },

    async detachAll(id, db = pool) {
      await db.query(`DELETE FROM ${joinTable} WHERE ${joinKey} = ?`, [id]);
    },

    async remove(id, db = pool) {
      await db.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    },

    // kept for the bulk sync flow (INSERT ... ON DUPLICATE KEY)
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
  };
}

module.exports = {
  categories: makeRepo('categories', 'topic_categories', 'category_id'),
  tags: makeRepo('tags', 'topic_tags', 'tag_id'),
};
