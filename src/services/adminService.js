const pool = require('../config/db');
const taxonomyRepo = require('../repositories/taxonomyRepository');
const contentRepo = require('../repositories/contentWriteRepository');
const groupRepo = require('../repositories/groupRepository');
const { ApiError } = require('../middleware/error');
const { toId } = require('../utils/parse');
const { mapCategoryRow, mapTagRow, mapLearningGroupRow } = require('../utils/apiMappers');

/* --------------------------------------------------------------- taxonomy */

function taxonomyService(kind) {
  const repo = taxonomyRepo[kind];
  const mapper = kind === 'categories' ? mapCategoryRow : mapTagRow;
  const label = kind === 'categories' ? 'Category' : 'Tag';

  return {
    async list() {
      const rows = await repo.findAll();
      return rows.map(mapper);
    },
    async create({ id, title, description }) {
      if (!title || !String(title).trim()) throw ApiError.badRequest('Title is required');
      const newId = await repo.upsert({ id, title, description });
      const row = await repo.findById(newId);
      return mapper(row || { id: newId, title, description, status: 1 });
    },
    async update(id, body) {
      await repo.update(id, body);
      const row = await repo.findById(id);
      if (!row) throw ApiError.notFound(`${label} not found`);
      return mapper(row);
    },
    async remove(id) {
      await repo.remove(id);
    },
  };
}

const categories = taxonomyService('categories');
const tags = taxonomyService('tags');

/* ----------------------------------------------------------------- topics */

async function saveTopic(body) {
  if (!body.title || !String(body.title).trim()) throw ApiError.badRequest('Title is required');
  return pool.withTransaction(async (conn) => {
    const topicId = await contentRepo.upsertTopic(body, conn);
    await contentRepo.replaceTopicRelations(topicId, body.categoryIds, body.tagIds, conn);
    return { id: topicId, title: body.title, categoryIds: body.categoryIds, tagIds: body.tagIds };
  });
}

async function deleteTopic(id) {
  await contentRepo.deleteTopic(id);
}

/* ---------------------------------------------------------------- lessons */

async function saveLesson(body) {
  if (toId(body.topicId) == null) throw ApiError.badRequest('A valid topicId is required');
  const lessonId = await contentRepo.upsertLesson(body);
  return { id: lessonId, topicId: body.topicId, title: body.title };
}

async function deleteLesson(id) {
  await contentRepo.deleteLesson(id);
}

/* ------------------------------------------------------------------ steps */

async function saveStep(body) {
  if (toId(body.lessonId) == null) throw ApiError.badRequest('A valid lessonId is required');
  return pool.withTransaction(async (conn) => {
    const stepId = await contentRepo.upsertStep(body, conn);
    await contentRepo.replaceStepPrerequisites(stepId, body.prerequisiteStepIds, conn);
    return { id: stepId, lessonId: body.lessonId, title: body.title };
  });
}

async function deleteStep(id) {
  await contentRepo.deleteStep(id);
}

async function updateStepBlocks(stepId, blocks) {
  await contentRepo.replaceStepBlocks(stepId, blocks);
}

async function updateStepQuizzes(stepId, quizzes) {
  await contentRepo.replaceStepQuizzes(stepId, quizzes);
}

/* ----------------------------------------------------------------- groups */

async function mapGroup(row) {
  const [grantedTopicIds, memberIds] = await Promise.all([
    groupRepo.findTopicIds(row.id),
    groupRepo.findMemberIds(row.id),
  ]);
  return mapLearningGroupRow(row, { grantedTopicIds, memberIds });
}

async function listGroups() {
  const rows = await groupRepo.findAll();
  const groups = [];
  for (const row of rows) groups.push(await mapGroup(row));
  return groups;
}

async function getGroup(id) {
  const row = await groupRepo.findById(id);
  if (!row) throw ApiError.notFound('Group not found');
  return mapGroup(row);
}

async function saveGroup(body) {
  if (!body.title || !String(body.title).trim()) throw ApiError.badRequest('Title is required');
  const groupId = await pool.withTransaction(async (conn) => {
    const id = await groupRepo.upsert(body, conn);
    await groupRepo.replaceRelations(id, body.grantedTopicIds, body.memberIds, conn);
    return id;
  });
  return getGroup(groupId);
}

async function deleteGroup(id) {
  await groupRepo.softDelete(id);
}

async function addMember(groupId, userId) {
  await groupRepo.addMember(groupId, userId);
}

async function removeMember(groupId, userId) {
  await groupRepo.removeMember(groupId, userId);
}

/* ------------------------------------------------------------------- sync */

/**
 * Bulk import of the entire admin dataset. Wrapped in a single transaction so a
 * partial failure never leaves the content tree half-written.
 */
async function syncFullData({ categories: cats, tags: tagList, topics, groups }) {
  await pool.withTransaction(async (conn) => {
    if (Array.isArray(cats)) {
      for (const c of cats) {
        await taxonomyRepo.categories.upsert(
          { id: c.id, title: c.title, description: c.description },
          conn
        );
      }
    }
    if (Array.isArray(tagList)) {
      for (const t of tagList) {
        await taxonomyRepo.tags.upsert({ id: t.id, title: t.title, description: t.description }, conn);
      }
    }
    if (Array.isArray(topics)) {
      for (const topic of topics) {
        const topicId = await contentRepo.upsertTopic(topic, conn);
        await contentRepo.replaceTopicRelations(topicId, topic.categoryIds, topic.tagIds, conn);
        if (!Array.isArray(topic.lessons)) continue;

        for (let li = 0; li < topic.lessons.length; li += 1) {
          const lesson = topic.lessons[li];
          const lessonId = await contentRepo.upsertLesson(
            { ...lesson, topicId, orderIndex: lesson.orderIndex ?? li },
            conn
          );
          if (!Array.isArray(lesson.steps)) continue;

          for (let si = 0; si < lesson.steps.length; si += 1) {
            const step = lesson.steps[si];
            const stepId = await contentRepo.upsertStep(
              { ...step, lessonId, orderIndex: step.orderIndex ?? si, summary: step.summary ?? step.description },
              conn
            );
            await contentRepo.replaceStepPrerequisites(stepId, step.prerequisiteStepIds, conn);
            await contentRepo.replaceStepBlocks(stepId, step.contentBlocks, conn);
            await contentRepo.replaceStepQuizzes(stepId, step.quizQuestions, conn);
          }
        }
      }
    }
    if (Array.isArray(groups)) {
      for (const group of groups) {
        const id = await groupRepo.upsert(group, conn);
        await groupRepo.replaceRelations(id, group.grantedTopicIds, group.memberIds, conn);
      }
    }
  });
}

module.exports = {
  categories,
  tags,
  saveTopic,
  deleteTopic,
  saveLesson,
  deleteLesson,
  saveStep,
  deleteStep,
  updateStepBlocks,
  updateStepQuizzes,
  listGroups,
  getGroup,
  saveGroup,
  deleteGroup,
  addMember,
  removeMember,
  syncFullData,
};
