const pool = require('../config/db');
const { toId, toIdList, toMysqlDateTime } = require('../utils/parse');

async function findAll(db = pool) {
  const [rows] = await db.query(
    `SELECT id, title, description, expired_at, status
       FROM learning_groups
      WHERE COALESCE(status, 1) <> 2
      ORDER BY id DESC`
  );
  return rows;
}

async function findById(id, db = pool) {
  const [rows] = await db.query(
    `SELECT id, title, description, expired_at, status
       FROM learning_groups
      WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findTopicIds(groupId, db = pool) {
  const [rows] = await db.query(
    'SELECT topic_id FROM group_topics WHERE group_id = ? ORDER BY topic_id ASC',
    [groupId]
  );
  return rows.map((r) => r.topic_id);
}

async function findMemberIds(groupId, db = pool) {
  const [rows] = await db.query(
    'SELECT user_id FROM group_members WHERE group_id = ? ORDER BY user_id ASC',
    [groupId]
  );
  return rows.map((r) => r.user_id);
}

async function upsert(group, db = pool) {
  const id = toId(group.id);
  const expiredAt = toMysqlDateTime(group.expiredAt);

  if (id != null) {
    await db.query(
      `INSERT INTO learning_groups (id, title, description, expired_at, status)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), description = VALUES(description),
         expired_at = VALUES(expired_at), status = 1`,
      [id, group.title, group.description || '', expiredAt]
    );
    return id;
  }

  const [result] = await db.query(
    `INSERT INTO learning_groups (title, description, expired_at, status)
     VALUES (?, ?, ?, 1)`,
    [group.title, group.description || '', expiredAt]
  );
  return result.insertId;
}

async function replaceRelations(groupId, grantedTopicIds, memberIds, db = pool) {
  const [oldRows] = await db.query('SELECT user_id FROM group_members WHERE group_id = ?', [
    groupId,
  ]);
  const oldMemberIds = oldRows.map((r) => r.user_id);

  await db.query('DELETE FROM group_topics WHERE group_id = ?', [groupId]);
  await db.query('DELETE FROM group_members WHERE group_id = ?', [groupId]);

  for (const topicId of toIdList(grantedTopicIds)) {
    await db.query('INSERT IGNORE INTO group_topics (group_id, topic_id) VALUES (?, ?)', [
      groupId,
      topicId,
    ]);
  }

  const newMemberIds = toIdList(memberIds);
  for (const userId of newMemberIds) {
    await db.query('INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [
      groupId,
      userId,
    ]);
  }

  if (newMemberIds.length > 0) {
    await db.query(
      `UPDATE users SET plan = 'GROUP' WHERE id IN (${newMemberIds.map(() => '?').join(',')})`,
      newMemberIds
    );
  }

  const removedMemberIds = oldMemberIds.filter((id) => !newMemberIds.includes(id));
  for (const rId of removedMemberIds) {
    const [check] = await db.query(
      'SELECT COUNT(*) AS total FROM group_members WHERE user_id = ?',
      [rId]
    );
    if (Number(check[0]?.total || 0) === 0) {
      await db.query("UPDATE users SET plan = 'FREE' WHERE id = ? AND plan = 'GROUP'", [rId]);
    }
  }
}

async function softDelete(id, db = pool) {
  const [members] = await db.query('SELECT user_id FROM group_members WHERE group_id = ?', [id]);
  const memberIds = members.map((r) => r.user_id);

  await db.query('UPDATE learning_groups SET status = 2 WHERE id = ?', [id]);

  for (const userId of memberIds) {
    const [check] = await db.query(
      `SELECT COUNT(*) AS total
         FROM group_members gm
         JOIN learning_groups lg ON gm.group_id = lg.id
        WHERE gm.user_id = ? AND COALESCE(lg.status, 1) <> 2`,
      [userId]
    );
    if (Number(check[0]?.total || 0) === 0) {
      await db.query("UPDATE users SET plan = 'FREE' WHERE id = ? AND plan = 'GROUP'", [userId]);
    }
  }
}

async function addMember(groupId, userId, db = pool) {
  await db.query('INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [
    groupId,
    userId,
  ]);
  await db.query("UPDATE users SET plan = 'GROUP' WHERE id = ?", [userId]);
}

async function removeMember(groupId, userId, db = pool) {
  await db.query('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
    groupId,
    userId,
  ]);
  const [check] = await db.query(
    'SELECT COUNT(*) AS total FROM group_members WHERE user_id = ?',
    [userId]
  );
  if (Number(check[0]?.total || 0) === 0) {
    await db.query("UPDATE users SET plan = 'FREE' WHERE id = ? AND plan = 'GROUP'", [userId]);
  }
}

module.exports = {
  findAll,
  findById,
  findTopicIds,
  findMemberIds,
  upsert,
  replaceRelations,
  softDelete,
  addMember,
  removeMember,
};
