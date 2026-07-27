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

async function findTopics(topicId = null, db = pool) {
  if (topicId != null) {
    const [rows] = await db.query(`SELECT * FROM topics WHERE id = ?`, [topicId]);
    return rows;
  }
  const [rows] = await db.query(`SELECT * FROM topics ORDER BY created_at DESC, id DESC`);
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
  const [stepGroups, lessonGroups, topicGroups] = await Promise.all([
    db.query(`SELECT group_id FROM group_steps WHERE step_id = ?`, [stepId]),
    db.query(`SELECT group_id FROM group_lessons WHERE lesson_id = ?`, [step.lesson_id]),
    db.query(`SELECT group_id FROM group_topics WHERE topic_id = ?`, [step.topic_id]),
  ]);

  const allowedGroupIds = Array.from(
    new Set([
      ...stepGroups[0].map((g) => String(g.group_id)),
      ...lessonGroups[0].map((g) => String(g.group_id)),
      ...topicGroups[0].map((g) => String(g.group_id)),
    ])
  );

  let effectiveAccessLevel = step.access_level || step.lesson_access_level || step.topic_access_level || 'FREE';

  return {
    ...step,
    effectiveAccessLevel,
    allowedGroupIds,
  };
}

module.exports = {
  findTopics,
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
