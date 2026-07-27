const pool = require('../config/db');
const taxonomyRepo = require('../repositories/taxonomyRepository');
const contentRepo = require('../repositories/contentWriteRepository');
const readRepo = require('../repositories/topicReadRepository');
const groupRepo = require('../repositories/groupRepository');
const { ApiError } = require('../middleware/error');
const { toId } = require('../utils/parse');
const { mapCategoryRow, mapTagRow, mapLearningGroupRow } = require('../utils/apiMappers');
const { validateCreate: validateTaxonomyCreate, validateUpdate: validateTaxonomyUpdate } = require('../utils/taxonomyValidation');
const { sanitizeRichText } = require('../utils/htmlSanitize');

/* --------------------------------------------------------------- taxonomy */

function taxonomyService(kind) {
  const repo = taxonomyRepo[kind];
  const mapper = kind === 'categories' ? mapCategoryRow : mapTagRow;
  const label = kind === 'categories' ? 'Category' : 'Tag';

  // attach usageCount (how many topics link to this item) to the mapped shape
  const present = (row) => ({ ...mapper(row), usageCount: Number(row.usageCount ?? 0) });

  return {
    async list({ search, status } = {}) {
      const rows = await repo.findAll({ search: search ? String(search).trim() : undefined, status });
      return rows.map(present);
    },
    async create(body) {
      const data = validateTaxonomyCreate(body);
      if (await repo.existsByTitle(data.title)) {
        throw ApiError.conflict(`${label} "${data.title}" already exists`);
      }
      const id = await repo.insert(data);
      return present(await repo.findById(id));
    },
    async update(id, body) {
      const existing = await repo.findById(id);
      if (!existing) throw ApiError.notFound(`${label} not found`);
      const data = validateTaxonomyUpdate(body);
      if (data.title && (await repo.existsByTitle(data.title, id))) {
        throw ApiError.conflict(`${label} "${data.title}" already exists`);
      }
      await repo.update(id, data);
      return present(await repo.findById(id));
    },
    // Delete is blocked while the item is linked to topics, unless force=true
    // (which detaches the links first). Keeps taxonomy referentially clean even
    // though the DB has no FK constraints.
    async remove(id, { force = false } = {}) {
      const existing = await repo.findById(id);
      if (!existing) throw ApiError.notFound(`${label} not found`);
      const usage = await repo.countUsage(id);
      if (usage > 0 && !force) {
        throw new ApiError(
          `${label} is linked to ${usage} topic${usage === 1 ? '' : 's'}. Detach them first or delete with force.`,
          409,
          { usageCount: usage }
        );
      }
      if (usage > 0 && force) await repo.detachAll(id);
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
    await contentRepo.replaceTopicRelations(topicId, body.categoryIds, body.tagIds, body.allowedGroupIds, conn);
    return { id: topicId, title: body.title, categoryIds: body.categoryIds, tagIds: body.tagIds, allowedGroupIds: body.allowedGroupIds };
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
  let lessonId = toId(body.lessonId);
  const stepId = toId(body.id);
  if (lessonId == null && stepId != null) {
    const existing = await readRepo.findStepById(stepId);
    if (existing) lessonId = toId(existing.lesson_id);
  }
  if (lessonId == null) throw ApiError.badRequest('A valid lessonId is required');
  body.lessonId = lessonId;
  return pool.withTransaction(async (conn) => {
    const savedId = await contentRepo.upsertStep(body, conn);
    await contentRepo.replaceStepPrerequisites(savedId, body.prerequisiteStepIds, conn);
    return { id: savedId, lessonId: body.lessonId, title: body.title };
  });
}

async function deleteStep(id) {
  await contentRepo.deleteStep(id);
}

// Block types whose `body` holds rich HTML and must be sanitized before storing.
const RICH_BLOCK_TYPES = new Set(['RICHTEXT', 'PARAGRAPH', 'CALLOUT', 'QUOTE', 'HEADING']);

async function updateStepBlocks(stepId, blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  const cleaned = list.map((block, index) => {
    const type = String(block.type || block.blockType || 'RICHTEXT').toUpperCase();
    // CODE keeps its body raw (it is escaped when rendered); rich blocks are sanitized.
    const body = RICH_BLOCK_TYPES.has(type) ? sanitizeRichText(block.body) : (block.body ?? '');
    return { ...block, type, body, orderIndex: block.orderIndex ?? index };
  });
  await contentRepo.replaceStepBlocks(stepId, cleaned);
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
