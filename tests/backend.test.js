/**
 * DB-less unit tests. Run with:  node --test
 *
 * These cover the pure logic and — most importantly — assert that the progress
 * upsert statements write the NOT NULL `status` / `quiz_score` columns, which is
 * the fix for the "progress resets on reload" bug.
 */
const test = require('node:test');
const assert = require('node:assert');

const parse = require('../src/utils/parse');
const mappers = require('../src/utils/apiMappers');
const progressRepo = require('../src/repositories/progressRepository');

/* ------------------------------------------------------------------- parse */

test('parse.toId accepts positive ints, rejects junk', () => {
  assert.equal(parse.toId('5'), 5);
  assert.equal(parse.toId(0), null);
  assert.equal(parse.toId(-3), null);
  assert.equal(parse.toId('abc'), null);
  assert.equal(parse.toId(''), null);
});

test('parse.toIdList dedupes and filters', () => {
  assert.deepEqual(parse.toIdList(['1', 1, 2, 'x', 0, null]), [1, 2]);
});

test('parse.normalizePassThreshold clamps to 1..100', () => {
  assert.equal(parse.normalizePassThreshold(0), 70);
  assert.equal(parse.normalizePassThreshold(150), 70);
  assert.equal(parse.normalizePassThreshold(85), 85);
});

test('parse.parseJsonArray handles strings, arrays and junk', () => {
  assert.deepEqual(parse.parseJsonArray('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parse.parseJsonArray(['a']), ['a']);
  assert.deepEqual(parse.parseJsonArray('not json'), []);
  assert.deepEqual(parse.parseJsonArray(null), []);
});

/* ----------------------------------------------------------------- mappers */

test('mapStepRow merges per-user progress correctly', () => {
  const step = mappers.mapStepRow(
    { id: 1, lesson_id: 2, title: 't', summary: 's', pass_threshold: 70, checklist_json: '["a","b"]' },
    { progressStatus: 'COMPLETED', completedChecklist: ['a'], quizScore: 90 }
  );
  assert.equal(step.progressStatus, 'COMPLETED');
  assert.equal(step.completed, true);
  assert.deepEqual(step.checklist, ['a', 'b']);
  assert.deepEqual(step.completedChecklist, ['a']);
  assert.equal(step.quizScore, 90);
});

test('mapTopicRow computes progressPercent from nested steps', () => {
  const topic = mappers.mapTopicRow(
    { id: 1, title: 'T' },
    {
      lessons: [
        { steps: [{ progressStatus: 'COMPLETED' }, { progressStatus: 'NOT_STARTED' }] },
      ],
    }
  );
  assert.equal(topic.completedStepsCount, 1);
  assert.equal(topic.totalStepsCount, 2);
  assert.equal(topic.progressPercent, 50);
});

/* ------------------------------------------- progress upsert SQL (bug fix) */

function mockDb() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT COUNT/i.test(sql)) return [[{ completedCount: 3 }], []];
      return [[], []];
    },
  };
}

test('upsertStatus writes NOT NULL status + quiz_score columns', async () => {
  const db = mockDb();
  await progressRepo.upsertStatus(
    { userId: 5, stepId: 7, progressStatus: 'COMPLETED', completedChecklistJson: '[]' },
    db
  );
  const { sql, params } = db.calls[0];
  assert.match(sql, /INSERT INTO user_step_progress/i);
  assert.match(sql, /\bstatus\b/, 'must set the NOT NULL status column');
  assert.match(sql, /quiz_score/, 'must set the NOT NULL quiz_score column');
  assert.match(sql, /ON DUPLICATE KEY UPDATE/i);
  assert.deepEqual(params, [5, 7, 'COMPLETED', '[]']);
});

test('upsertQuizResult writes status and the given quiz score', async () => {
  const db = mockDb();
  await progressRepo.upsertQuizResult(
    { userId: 5, stepId: 7, progressStatus: 'COMPLETED', quizScore: 80, completedChecklistJson: '[]' },
    db
  );
  const { sql, params } = db.calls[0];
  assert.match(sql, /\bstatus\b/);
  assert.match(sql, /quiz_score\s*=\s*VALUES\(quiz_score\)/i);
  assert.deepEqual(params, [5, 7, 'COMPLETED', 80, '[]']);
});

test('syncCompletedStepsCount returns the recomputed count', async () => {
  const db = mockDb();
  const count = await progressRepo.syncCompletedStepsCount(5, db);
  assert.equal(count, 3);
  assert.match(db.calls[1].sql, /UPDATE users/i);
});

test('findByUserForSteps returns empty map for anonymous user', async () => {
  const db = mockDb();
  const map = await progressRepo.findByUserForSteps(null, [1, 2], db);
  assert.equal(map.size, 0);
  assert.equal(db.calls.length, 0);
});
