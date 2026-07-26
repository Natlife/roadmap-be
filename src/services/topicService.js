const repo = require('../repositories/topicReadRepository');
const progressRepo = require('../repositories/progressRepository');
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

  const [categoryRows, tagRows, lessonRows] = await Promise.all([
    repo.findCategoriesForTopics(topicIds),
    repo.findTagsForTopics(topicIds),
    repo.findLessonsForTopics(topicIds),
  ]);

  const lessonIds = lessonRows.map((l) => l.id);
  const stepRows = await repo.findStepsForLessons(lessonIds);
  const stepIds = stepRows.map((s) => s.id);

  const [blockRows, quizRows, prereqRows, progressMap] = await Promise.all([
    repo.findBlocksForSteps(stepIds),
    repo.findQuizzesForSteps(stepIds),
    repo.findPrerequisitesForSteps(stepIds),
    progressRepo.findByUserForSteps(userId, stepIds),
  ]);

  const categoriesByTopic = groupBy(categoryRows, 'topic_id');
  const tagsByTopic = groupBy(tagRows, 'topic_id');
  const lessonsByTopic = groupBy(lessonRows, 'topic_id');
  const stepsByLesson = groupBy(stepRows, 'lesson_id');
  const blocksByStep = groupBy(blockRows, 'step_id');
  const quizzesByStep = groupBy(quizRows, 'step_id');
  const prereqsByStep = groupBy(prereqRows, 'step_id');

  const buildStep = (stepRow) => {
    const key = String(stepRow.id);
    const progress = progressMap.get(key) || {};
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
  const stepRow = await repo.findStepById(stepId);
  if (!stepRow) return null;

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
