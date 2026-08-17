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

async function saveTopic(body, currentUser = {}) {
  if (!body.title || !String(body.title).trim()) throw ApiError.badRequest('Title is required');
  const { userId, userRole } = currentUser;

  const topicId = toId(body.id);
  if (topicId != null) {
    const existing = await contentRepo.findTopicById(topicId);
    if (existing && userRole === 'AUTHOR' && existing.author_id && String(existing.author_id) !== String(userId)) {
      throw ApiError.forbidden('Forbidden: You can only edit your own blogs');
    }
  }

  const topicPayload = {
    ...body,
    authorId: body.authorId ?? (topicId == null ? userId : undefined),
    approvalStatus: userRole === 'AUTHOR' ? 'PENDING' : (body.approvalStatus || 'APPROVED'),
    rejectionReason: userRole === 'AUTHOR' ? null : body.rejectionReason,
  };

  return pool.withTransaction(async (conn) => {
    const savedId = await contentRepo.upsertTopic(topicPayload, conn);
    await contentRepo.replaceTopicRelations(savedId, body.categoryIds, body.tagIds, body.allowedGroupIds, conn);
    return { id: savedId, title: body.title, categoryIds: body.categoryIds, tagIds: body.tagIds, allowedGroupIds: body.allowedGroupIds };
  });
}

async function deleteTopic(id, currentUser = {}) {
  const { userId, userRole } = currentUser;
  if (userRole === 'AUTHOR') {
    const existing = await contentRepo.findTopicById(id);
    if (existing && existing.author_id && String(existing.author_id) !== String(userId)) {
      throw ApiError.forbidden('Forbidden: You can only delete your own blogs');
    }
  }
  await contentRepo.deleteTopic(id);
}

/* ---------------------------------------------------------------- lessons */

async function saveLesson(body, currentUser = {}) {
  if (toId(body.topicId) == null) throw ApiError.badRequest('A valid topicId is required');
  const { userId, userRole } = currentUser;

  const lessonId = toId(body.id);
  if (lessonId != null) {
    const existing = await contentRepo.findLessonById(lessonId);
    if (existing && userRole === 'AUTHOR' && existing.author_id && String(existing.author_id) !== String(userId)) {
      throw ApiError.forbidden('Forbidden: You can only edit your own lessons');
    }
  }

  const lessonPayload = {
    ...body,
    authorId: body.authorId ?? (lessonId == null ? userId : undefined),
  };

  const savedId = await contentRepo.upsertLesson(lessonPayload);
  return { id: savedId, topicId: body.topicId, title: body.title };
}

async function deleteLesson(id, currentUser = {}) {
  const { userId, userRole } = currentUser;
  if (userRole === 'AUTHOR') {
    const existing = await contentRepo.findLessonById(id);
    if (existing && existing.author_id && String(existing.author_id) !== String(userId)) {
      throw ApiError.forbidden('Forbidden: You can only delete your own lessons');
    }
  }
  await contentRepo.deleteLesson(id);
}

/* ------------------------------------------------------------------ steps */

async function saveStep(body, currentUser = {}) {
  let lessonId = toId(body.lessonId);
  const stepId = toId(body.id);
  const { userId, userRole } = currentUser;

  if (lessonId == null && stepId != null) {
    const existing = await readRepo.findStepById(stepId);
    if (existing) lessonId = toId(existing.lesson_id);
  }
  if (lessonId == null) throw ApiError.badRequest('A valid lessonId is required');
  body.lessonId = lessonId;

  if (stepId != null) {
    const existing = await contentRepo.findStepById(stepId);
    if (existing && userRole === 'AUTHOR' && existing.author_id && String(existing.author_id) !== String(userId)) {
      throw ApiError.forbidden('Forbidden: You can only edit your own steps');
    }
  }

  const stepPayload = {
    ...body,
    authorId: body.authorId ?? (stepId == null ? userId : undefined),
    approvalStatus: userRole === 'AUTHOR' ? 'PENDING' : (body.approvalStatus || 'APPROVED'),
    rejectionReason: userRole === 'AUTHOR' ? null : body.rejectionReason,
  };

  return pool.withTransaction(async (conn) => {
    const savedId = await contentRepo.upsertStep(stepPayload, conn);
    await contentRepo.replaceStepPrerequisites(savedId, body.prerequisiteStepIds, conn);
    return { id: savedId, lessonId: body.lessonId, title: body.title };
  });
}

async function deleteStep(id, currentUser = {}) {
  const { userId, userRole } = currentUser;
  if (userRole === 'AUTHOR') {
    const existing = await contentRepo.findStepById(id);
    if (existing && existing.author_id && String(existing.author_id) !== String(userId)) {
      throw ApiError.forbidden('Forbidden: You can only delete your own steps');
    }
  }
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

/* --------------------------------------------------------------- approvals */

async function getPendingApprovals() {
  const [topics, steps] = await Promise.all([
    readRepo.findPendingTopics(),
    readRepo.findPendingSteps(),
  ]);

  return {
    topics: topics.map((t) => ({
      id: String(t.id),
      code: t.code || `BLOG-${String(t.id).padStart(5, '0')}`,
      title: t.title,
      description: t.description,
      approvalStatus: t.approval_status,
      author: t.author_id ? {
        id: String(t.author_id),
        username: t.author_username,
        fullName: t.author_full_name,
        email: t.author_email,
      } : null,
      createdAt: t.created_at,
    })),
    steps: steps.map((s) => ({
      id: String(s.id),
      code: s.code || `STEP-${String(s.id).padStart(5, '0')}`,
      title: s.title,
      summary: s.summary,
      topicTitle: s.topic_title,
      lessonTitle: s.lesson_title,
      approvalStatus: s.approval_status,
      author: s.author_id ? {
        id: String(s.author_id),
        username: s.author_username,
        fullName: s.author_full_name,
        email: s.author_email,
      } : null,
      createdAt: s.created_at,
    })),
  };
}

async function approveTopic(id) {
  const existing = await contentRepo.findTopicById(id);
  if (!existing) throw ApiError.notFound('Topic not found');
  await contentRepo.updateTopicApproval(id, 'APPROVED', null);
  return { id: String(id), approvalStatus: 'APPROVED' };
}

async function rejectTopic(id, reason = null) {
  const existing = await contentRepo.findTopicById(id);
  if (!existing) throw ApiError.notFound('Topic not found');
  await contentRepo.updateTopicApproval(id, 'REJECTED', reason || 'Rejected by Admin');
  return { id: String(id), approvalStatus: 'REJECTED', rejectionReason: reason };
}

async function approveStep(id) {
  const existing = await contentRepo.findStepById(id);
  if (!existing) throw ApiError.notFound('Step not found');
  await contentRepo.updateStepApproval(id, 'APPROVED', null);
  return { id: String(id), approvalStatus: 'APPROVED' };
}

async function rejectStep(id, reason = null) {
  const existing = await contentRepo.findStepById(id);
  if (!existing) throw ApiError.notFound('Step not found');
  await contentRepo.updateStepApproval(id, 'REJECTED', reason || 'Rejected by Admin');
  return { id: String(id), approvalStatus: 'REJECTED', rejectionReason: reason };
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
  getPendingApprovals,
  approveTopic,
  rejectTopic,
  approveStep,
  rejectStep,
};

