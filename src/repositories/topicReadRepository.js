const pool = require('../config/db');

/**
 * Batched read access for the topic → lesson → step → (blocks/quizzes) tree.
 * Every "forX" helper takes a list of parent ids and returns all matching rows
 * in a single query, so building the full tree costs a fixed number of queries
 * instead of O(topics × lessons × steps) round-trips.
 */

function inClause(ids) {
  return ids.map(() => '?').join(', ');
}

async function findTopics(topicId = null, options = {}, db = pool) {
  const { userRole, userId } = options;
  const conditions = [];
  const params = [];

  if (topicId != null) {
    conditions.push('id = ?');
    params.push(topicId);
  }

  // Approval status filter
  if (userRole === 'ADMIN') {
    // Admin sees all topics
  } else if (userRole === 'AUTHOR' && userId) {
    conditions.push('(approval_status = "APPROVED" OR author_id = ?)');
    params.push(userId);
  } else {
    conditions.push('approval_status = "APPROVED"');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.query(`SELECT * FROM topics ${whereClause} ORDER BY created_at DESC, id DESC`, params);
  return rows;
}

async function findPendingTopics(db = pool) {
  const [rows] = await db.query(
    `SELECT t.*, u.user_name AS author_username, u.full_name AS author_full_name, u.email AS author_email
       FROM topics t
       LEFT JOIN users u ON t.author_id = u.id
      WHERE t.approval_status = 'PENDING'
      ORDER BY t.created_at DESC`
  );
  return rows;
}

async function findPendingSteps(db = pool) {
  const [rows] = await db.query(
    `SELECT s.*, l.title AS lesson_title, t.title AS topic_title,
            u.user_name AS author_username, u.full_name AS author_full_name, u.email AS author_email
       FROM steps s
       LEFT JOIN lessons l ON s.lesson_id = l.id
       LEFT JOIN topics t ON l.topic_id = t.id
       LEFT JOIN users u ON s.author_id = u.id
      WHERE s.approval_status = 'PENDING'
      ORDER BY s.created_at DESC`
  );
  return rows;
}


async function findCategoriesForTopics(topicIds, db = pool) {
  if (topicIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT tc.topic_id, c.*
       FROM categories c
       INNER JOIN topic_categories tc ON tc.category_id = c.id
      WHERE tc.topic_id IN (${inClause(topicIds)})
      ORDER BY c.id ASC`,
    topicIds
  );
  return rows;
}

async function findTagsForTopics(topicIds, db = pool) {
  if (topicIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT tt.topic_id, t.*
       FROM tags t
       INNER JOIN topic_tags tt ON tt.tag_id = t.id
      WHERE tt.topic_id IN (${inClause(topicIds)})
      ORDER BY t.id ASC`,
    topicIds
  );
  return rows;
}

async function findLessonsForTopics(topicIds, db = pool) {
  if (topicIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT * FROM lessons
      WHERE topic_id IN (${inClause(topicIds)})
      ORDER BY order_index ASC, id ASC`,
    topicIds
  );
  return rows;
}

async function findStepsForLessons(lessonIds, db = pool) {
  if (lessonIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT * FROM steps
      WHERE lesson_id IN (${inClause(lessonIds)})
      ORDER BY order_index ASC, id ASC`,
    lessonIds
  );
  return rows;
}

async function findBlocksForSteps(stepIds, db = pool) {
  if (stepIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT * FROM content_blocks
      WHERE step_id IN (${inClause(stepIds)})
      ORDER BY order_index ASC, id ASC`,
    stepIds
  );
  return rows;
}

async function findQuizzesForSteps(stepIds, db = pool) {
  if (stepIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT * FROM quiz_questions
      WHERE step_id IN (${inClause(stepIds)})
      ORDER BY id ASC`,
    stepIds
  );
  return rows;
}

async function findPrerequisitesForSteps(stepIds, db = pool) {
  if (stepIds.length === 0) return [];
  const [rows] = await db.query(
    `SELECT step_id, prerequisite_step_id
       FROM step_prerequisites
      WHERE step_id IN (${inClause(stepIds)})
      ORDER BY prerequisite_step_id ASC`,
    stepIds
  );
  return rows;
}

async function findStepById(stepId, db = pool) {
  const [rows] = await db.query(`SELECT * FROM steps WHERE id = ? LIMIT 1`, [stepId]);
  return rows[0] || null;
}

async function findStepWithAccess(stepId, db = pool) {
  const [rows] = await db.query(
    `SELECT s.*, 
            l.access_level AS lesson_access_level,
            t.access_level AS topic_access_level,
            l.topic_id
       FROM steps s
       LEFT JOIN lessons l ON s.lesson_id = l.id
       LEFT JOIN topics t ON l.topic_id = t.id
      WHERE s.id = ?
      LIMIT 1`,
    [stepId]
  );
  if (!rows[0]) return null;

  const step = rows[0];
  const [topicGroups] = await db.query(
    `SELECT group_id FROM group_topics WHERE topic_id = ?`, [step.topic_id]
  );

  const allowedGroupIds = topicGroups.map((g) => String(g.group_id));

  const effectiveAccessLevel = step.access_level || step.lesson_access_level || step.topic_access_level || 'FREE';

  return {
    ...step,
    effectiveAccessLevel,
    allowedGroupIds,
  };
}

module.exports = {
  findTopics,
  findPendingTopics,
  findPendingSteps,
  findCategoriesForTopics,
  findTagsForTopics,
  findLessonsForTopics,
  findStepsForLessons,
  findBlocksForSteps,
  findQuizzesForSteps,
  findPrerequisitesForSteps,
  findStepById,
  findStepWithAccess,
};

