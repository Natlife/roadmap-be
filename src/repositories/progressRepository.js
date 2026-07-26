const pool = require('../config/db');
const { parseJsonArray } = require('../utils/parse');
const { normalizeProgressStatus } = require('../utils/apiMappers');

const EMPTY_PROGRESS = Object.freeze({
  progressStatus: 'NOT_STARTED',
  completedChecklist: [],
  quizScore: 0,
});

/**
 * Read one user's progress for a single step.
 * Returns a normalized default when there is no row (or no user).
 */
async function findByUserAndStep(userId, stepId, db = pool) {
  if (!userId) return { ...EMPTY_PROGRESS };

  const [rows] = await db.query(
    `SELECT progress_status, completed_checklist_json, quiz_score
       FROM user_step_progress
      WHERE user_id = ? AND step_id = ?
      LIMIT 1`,
    [userId, stepId]
  );

  const row = rows[0];
  if (!row) return { ...EMPTY_PROGRESS };

  return {
    progressStatus: normalizeProgressStatus(row.progress_status),
    completedChecklist: parseJsonArray(row.completed_checklist_json),
    quizScore: Number(row.quiz_score || 0),
  };
}

/**
 * Load progress for many steps at once (avoids the per-step N+1 query when
 * building a full topic tree). Returns a Map keyed by step id.
 */
async function findByUserForSteps(userId, stepIds, db = pool) {
  const map = new Map();
  if (!userId || !Array.isArray(stepIds) || stepIds.length === 0) return map;

  const placeholders = stepIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT step_id, progress_status, completed_checklist_json, quiz_score
       FROM user_step_progress
      WHERE user_id = ? AND step_id IN (${placeholders})`,
    [userId, ...stepIds]
  );

  for (const row of rows) {
    map.set(String(row.step_id), {
      progressStatus: normalizeProgressStatus(row.progress_status),
      completedChecklist: parseJsonArray(row.completed_checklist_json),
      quizScore: Number(row.quiz_score || 0),
    });
  }
  return map;
}

/**
 * Upsert checklist / status progress.
 * NOTE: `status` and `quiz_score` are written explicitly. The production DB
 * (created by Spring/Hibernate from a primitive `int`) declares these columns
 * NOT NULL with no default, so an INSERT that omits them fails under MySQL
 * strict mode — which was silently dropping every new progress row.
 */
async function upsertStatus(
  { userId, stepId, progressStatus, completedChecklistJson },
  db = pool
) {
  await db.query(
    `INSERT INTO user_step_progress
       (user_id, step_id, progress_status, completed_checklist_json,
        quiz_score, status, last_accessed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       progress_status         = VALUES(progress_status),
       completed_checklist_json = VALUES(completed_checklist_json),
       last_accessed_at        = NOW(),
       updated_at              = NOW()`,
    [userId, stepId, progressStatus, completedChecklistJson]
  );
}

/** Upsert quiz result (score + resulting status), preserving the checklist. */
async function upsertQuizResult(
  { userId, stepId, progressStatus, quizScore, completedChecklistJson },
  db = pool
) {
  await db.query(
    `INSERT INTO user_step_progress
       (user_id, step_id, progress_status, quiz_score, completed_checklist_json,
        status, last_accessed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       progress_status         = VALUES(progress_status),
       quiz_score              = VALUES(quiz_score),
       completed_checklist_json = VALUES(completed_checklist_json),
       last_accessed_at        = NOW(),
       updated_at              = NOW()`,
    [userId, stepId, progressStatus, quizScore, completedChecklistJson]
  );
}

/** Recompute and persist the denormalized completed-steps counter for a user. */
async function syncCompletedStepsCount(userId, db = pool) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS completedCount
       FROM user_step_progress
      WHERE user_id = ?
        AND UPPER(COALESCE(progress_status, 'NOT_STARTED')) = 'COMPLETED'`,
    [userId]
  );
  const completedCount = Number(rows[0]?.completedCount || 0);

  await db.query(`UPDATE users SET completed_steps_count = ? WHERE id = ?`, [
    completedCount,
    userId,
  ]);

  return completedCount;
}

module.exports = {
  findByUserAndStep,
  findByUserForSteps,
  upsertStatus,
  upsertQuizResult,
  syncCompletedStepsCount,
};
