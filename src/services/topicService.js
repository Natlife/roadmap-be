const repo = require('../repositories/topicReadRepository');
const progressRepo = require('../repositories/progressRepository');
const userRepo = require('../repositories/userRepository');
const { ApiError } = require('../middleware/error');
const { mapStepRow, mapLessonRow, mapTopicRow } = require('../utils/apiMappers');

function groupBy(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row[keyField]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * Build the full topic tree (topics → lessons → steps → blocks/quizzes) with
 * per-user progress merged in. Uses a fixed number of batched queries.
 *
 * @param {number|string|null} topicId  restrict to a single topic, or null for all
 * @param {number|null} userId          merge this user's progress (null = anonymous)
 */
async function getTopicTree(topicId = null, userId = null) {
  const topicRows = await repo.findTopics(topicId);
  if (topicRows.length === 0) return [];

  const topicIds = topicRows.map((t) => t.id);
  const [categoriesByTopic, tagsByTopic, lessonRows] = await Promise.all([
    repo.findCategoriesForTopics(topicIds).then((rows) => groupBy(rows, 'topic_id')),
    repo.findTagsForTopics(topicIds).then((rows) => groupBy(rows, 'topic_id')),
    repo.findLessonsForTopics(topicIds),
  ]);

  const lessonIds = lessonRows.map((l) => l.id);
  const stepRows = lessonIds.length ? await repo.findStepsForLessons(lessonIds) : [];

  const stepIds = stepRows.map((s) => s.id);
  const [blockRows, quizRows, prereqRows, userProgressMap] = await Promise.all([
    stepIds.length ? repo.findBlocksForSteps(stepIds) : [],
    stepIds.length ? repo.findQuizzesForSteps(stepIds) : [],
    stepIds.length ? repo.findPrerequisitesForSteps(stepIds) : [],
    stepIds.length ? progressRepo.findByUserForSteps(userId, stepIds) : new Map(),
  ]);

  const lessonsByTopic = groupBy(lessonRows, 'topic_id');
  const stepsByLesson = groupBy(stepRows, 'lesson_id');
  const blocksByStep = groupBy(blockRows, 'step_id');
  const quizzesByStep = groupBy(quizRows, 'step_id');
  const prereqsByStep = groupBy(prereqRows, 'step_id');

  const buildStep = (stepRow) => {
    const key = String(stepRow.id);
    const progress = userProgressMap.get(key) || {
      progressStatus: stepRow.prerequisites_count > 0 ? 'LOCKED' : 'NOT_STARTED',
      completedChecklist: [],
      quizScore: null,
    };
    return mapStepRow(stepRow, {
      prerequisiteStepIds: (prereqsByStep.get(key) || []).map((r) => r.prerequisite_step_id),
      contentBlocks: blocksByStep.get(key) || [],
      quizQuestions: quizzesByStep.get(key) || [],
      progressStatus: progress.progressStatus,
      completedChecklist: progress.completedChecklist,
      quizScore: progress.quizScore,
    });
  };

  const buildLesson = (lessonRow) => {
    const steps = (stepsByLesson.get(String(lessonRow.id)) || []).map(buildStep);
    return mapLessonRow(lessonRow, { steps });
  };

  return topicRows.map((topicRow) => {
    const key = String(topicRow.id);
    const lessons = (lessonsByTopic.get(key) || []).map(buildLesson);
    return mapTopicRow(topicRow, {
      categories: categoriesByTopic.get(key) || [],
      tags: tagsByTopic.get(key) || [],
      lessons,
    });
  });
}

/** Build a single step payload (with progress) for the step-detail endpoint. */
async function getStepDetail(stepId, userId = null) {
  const stepRow = await repo.findStepWithAccess(stepId);
  if (!stepRow) return null;

  const accessLevel = String(stepRow.effectiveAccessLevel || 'FREE').toUpperCase();
  if (accessLevel !== 'FREE') {
    if (!userId) {
      throw ApiError.unauthorized('Authentication required to access this content');
    }
    const user = await userRepo.findByIdWithRole(userId);
    if (!user) throw ApiError.unauthorized('User not found');

    const roleName = String(user.role || '').toUpperCase();
    const isSystemAdmin = roleName === 'ROLE_ADMIN' || roleName === 'ADMIN';

    if (!isSystemAdmin) {
      if (accessLevel === 'PREMIUM') {
        const userPlan = String(user.plan || 'FREE').toUpperCase();
        if (userPlan !== 'PREMIUM' && userPlan !== 'GROUP') {
          throw ApiError.forbidden('Upgrade to Premium to view this step content');
        }
      } else if (accessLevel === 'GROUP') {
        const userGroups = await userRepo.findGroupsForUser(userId);
        const userGroupIds = userGroups.map((g) => String(g.id));
        const hasGroupAccess = stepRow.allowedGroupIds.some((gid) => userGroupIds.includes(gid));
        if (!hasGroupAccess) {
          throw ApiError.forbidden('Access restricted to private group members');
        }
      }
    }
  }

  const [blockRows, quizRows, prereqRows, progress] = await Promise.all([
    repo.findBlocksForSteps([stepRow.id]),
    repo.findQuizzesForSteps([stepRow.id]),
    repo.findPrerequisitesForSteps([stepRow.id]),
    progressRepo.findByUserAndStep(userId, stepRow.id),
  ]);

  return mapStepRow(stepRow, {
    prerequisiteStepIds: prereqRows.map((r) => r.prerequisite_step_id),
    contentBlocks: blockRows,
    quizQuestions: quizRows,
    progressStatus: progress.progressStatus,
    completedChecklist: progress.completedChecklist,
    quizScore: progress.quizScore,
  });
}

module.exports = { getTopicTree, getStepDetail };
