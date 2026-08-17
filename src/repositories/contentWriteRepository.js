const pool = require('../config/db');
const { toId, toIdList, toUpperEnum } = require('../utils/parse');

/* ------------------------------------------------------------------ topics */

async function findTopicById(id, db = pool) {
  const [rows] = await db.query('SELECT * FROM topics WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function upsertTopic(topic, db = pool) {
  const id = toId(topic.id);
  const authorId = toId(topic.authorId);
  const approvalStatus = String(topic.approvalStatus || 'APPROVED').toUpperCase();
  const rejectionReason = topic.rejectionReason || null;
  const values = [
    topic.title,
    topic.description || '',
    topic.emoji || 'book',
    topic.levelLabel || 'Beginner',
    topic.estimatedHours || 4,
    toUpperEnum(topic.accessLevel, 'FREE'),
    authorId,
    approvalStatus,
    rejectionReason,
  ];

  if (id != null) {
    await db.query(
      `INSERT INTO topics (id, title, description, emoji, level_label, estimated_hours, access_level, author_id, approval_status, rejection_reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), description = VALUES(description), emoji = VALUES(emoji),
         level_label = VALUES(level_label), estimated_hours = VALUES(estimated_hours),
         access_level = VALUES(access_level), author_id = COALESCE(VALUES(author_id), author_id),
         approval_status = VALUES(approval_status), rejection_reason = VALUES(rejection_reason)`,
      [id, ...values]
    );

    const generatedCode = topic.code || `BLOG-${String(id).padStart(5, '0')}`;
    await db.query('UPDATE topics SET code = ? WHERE id = ? AND (code IS NULL OR code = "")', [generatedCode, id]);
    return id;
  }

  const [result] = await db.query(
    `INSERT INTO topics (title, description, emoji, level_label, estimated_hours, access_level, author_id, approval_status, rejection_reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    values
  );
  const newId = result.insertId;

  const generatedCode = topic.code || `BLOG-${String(newId).padStart(5, '0')}`;
  await db.query('UPDATE topics SET code = ? WHERE id = ?', [generatedCode, newId]);
  return newId;
}

async function replaceTopicRelations(topicId, categoryIds, tagIds, allowedGroupIds, db = pool) {
  if (Array.isArray(categoryIds)) {
    await db.query('DELETE FROM topic_categories WHERE topic_id = ?', [topicId]);
    for (const categoryId of toIdList(categoryIds)) {
      await db.query(
        'INSERT IGNORE INTO topic_categories (topic_id, category_id) VALUES (?, ?)',
        [topicId, categoryId]
      );
    }
  }
  if (Array.isArray(tagIds)) {
    await db.query('DELETE FROM topic_tags WHERE topic_id = ?', [topicId]);
    for (const tagId of toIdList(tagIds)) {
      await db.query('INSERT IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)', [
        topicId,
        tagId,
      ]);
    }
  }
  if (Array.isArray(allowedGroupIds)) {
    await db.query('DELETE FROM group_topics WHERE topic_id = ?', [topicId]);
    for (const groupId of toIdList(allowedGroupIds)) {
      await db.query('INSERT IGNORE INTO group_topics (group_id, topic_id) VALUES (?, ?)', [
        groupId,
        topicId,
      ]);
    }
  }
}

async function deleteTopic(id, db = pool) {
  await db.query('DELETE FROM topics WHERE id = ?', [id]);
}

async function updateTopicApproval(id, approvalStatus, rejectionReason = null, db = pool) {
  await db.query(
    'UPDATE topics SET approval_status = ?, rejection_reason = ? WHERE id = ?',
    [approvalStatus, rejectionReason, id]
  );
}

/* ----------------------------------------------------------------- lessons */

async function findLessonById(id, db = pool) {
  const [rows] = await db.query('SELECT * FROM lessons WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function upsertLesson(lesson, db = pool) {
  const id = toId(lesson.id);
  const authorId = toId(lesson.authorId);
  const code = lesson.code || null;
  const values = [
    code,
    lesson.topicId,
    authorId,
    lesson.title,
    lesson.summary || '',
    lesson.orderIndex || 0,
    toUpperEnum(lesson.accessLevel, 'FREE'),
    lesson.estimatedMinutes || 15,
  ];

  if (id != null) {
    await db.query(
      `INSERT INTO lessons (id, code, topic_id, author_id, title, summary, order_index, access_level, estimated_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         code = COALESCE(VALUES(code), code), author_id = COALESCE(VALUES(author_id), author_id),
         title = VALUES(title), summary = VALUES(summary), order_index = VALUES(order_index),
         access_level = VALUES(access_level), estimated_minutes = VALUES(estimated_minutes)`,
      [id, ...values]
    );

    if (!code) {
      const generatedCode = `LSN-${String(id).padStart(5, '0')}`;
      await db.query('UPDATE lessons SET code = ? WHERE id = ? AND (code IS NULL OR code = "")', [generatedCode, id]);
    }
    return id;
  }

  const [result] = await db.query(
    `INSERT INTO lessons (code, topic_id, author_id, title, summary, order_index, access_level, estimated_minutes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    values
  );
  const newId = result.insertId;

  if (!code) {
    const generatedCode = `LSN-${String(newId).padStart(5, '0')}`;
    await db.query('UPDATE lessons SET code = ? WHERE id = ?', [generatedCode, newId]);
  }

  return newId;
}

async function deleteLesson(id, db = pool) {
  await db.query('DELETE FROM lessons WHERE id = ?', [id]);
}

/* ------------------------------------------------------------------- steps */

async function findStepById(id, db = pool) {
  const [rows] = await db.query('SELECT * FROM steps WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function upsertStep(step, db = pool) {
  const id = toId(step.id);
  const authorId = toId(step.authorId);
  const approvalStatus = String(step.approvalStatus || 'APPROVED').toUpperCase();
  const rejectionReason = step.rejectionReason || null;

  const values = [
    step.lessonId,
    authorId,
    step.title,
    step.summary || '',
    step.orderIndex || 0,
    toUpperEnum(step.accessLevel, 'FREE'),
    step.note || '',
    step.theory || '',
    step.codeSnippet || '',
    step.codeLanguage || 'text',
    JSON.stringify(step.checklist || []),
    step.passThreshold || 80,
    step.estimatedMinutes || 10,
    step.xpReward || 20,
    approvalStatus,
    rejectionReason,
  ];

  if (id != null) {
    await db.query(
      `INSERT INTO steps
         (id, lesson_id, author_id, title, summary, order_index, access_level, note, theory,
          code_snippet, code_language, checklist_json, pass_threshold, estimated_minutes, xp_reward, approval_status, rejection_reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         author_id = COALESCE(VALUES(author_id), author_id),
         title = VALUES(title), summary = VALUES(summary), order_index = VALUES(order_index),
         access_level = VALUES(access_level), note = VALUES(note), theory = VALUES(theory),
         code_snippet = VALUES(code_snippet), code_language = VALUES(code_language),
         checklist_json = VALUES(checklist_json), pass_threshold = VALUES(pass_threshold),
         estimated_minutes = VALUES(estimated_minutes), xp_reward = VALUES(xp_reward),
         approval_status = VALUES(approval_status), rejection_reason = VALUES(rejection_reason)`,
      [id, ...values]
    );

    const generatedCode = step.code || `STEP-${String(id).padStart(5, '0')}`;
    await db.query('UPDATE steps SET code = ? WHERE id = ? AND (code IS NULL OR code = "")', [generatedCode, id]);
    return id;
  }

  const [result] = await db.query(
    `INSERT INTO steps
       (lesson_id, author_id, title, summary, order_index, access_level, note, theory,
        code_snippet, code_language, checklist_json, pass_threshold, estimated_minutes, xp_reward, approval_status, rejection_reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    values
  );
  const newId = result.insertId;

  const generatedCode = step.code || `STEP-${String(newId).padStart(5, '0')}`;
  await db.query('UPDATE steps SET code = ? WHERE id = ?', [generatedCode, newId]);
  return newId;
}

async function updateStepApproval(id, approvalStatus, rejectionReason = null, db = pool) {
  await db.query(
    'UPDATE steps SET approval_status = ?, rejection_reason = ? WHERE id = ?',
    [approvalStatus, rejectionReason, id]
  );
}


async function deleteStep(id, db = pool) {
  await db.query('DELETE FROM steps WHERE id = ?', [id]);
}

async function replaceStepPrerequisites(stepId, prerequisiteStepIds, db = pool) {
  if (!Array.isArray(prerequisiteStepIds)) return;
  await db.query('DELETE FROM step_prerequisites WHERE step_id = ?', [stepId]);
  for (const prerequisiteId of toIdList(prerequisiteStepIds)) {
    if (prerequisiteId === Number(stepId)) continue; // guard against self-reference
    await db.query(
      'INSERT IGNORE INTO step_prerequisites (step_id, prerequisite_step_id) VALUES (?, ?)',
      [stepId, prerequisiteId]
    );
  }
}

async function replaceStepBlocks(stepId, blocks, db = pool) {
  await db.query('DELETE FROM content_blocks WHERE step_id = ?', [stepId]);
  if (!Array.isArray(blocks)) return;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const blockType = String(block.type || block.blockType || 'PARAGRAPH').toUpperCase();
    await db.query(
      `INSERT INTO content_blocks
         (step_id, block_type, title, body, items_json, media_url, caption, code_language, order_index, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        stepId,
        blockType,
        block.title || '',
        block.body || '',
        JSON.stringify(block.items || []),
        block.mediaUrl || '',
        block.caption || '',
        block.codeLanguage || '',
        index,
      ]
    );
  }
}

async function replaceStepQuizzes(stepId, quizzes, db = pool) {
  await db.query('DELETE FROM quiz_questions WHERE step_id = ?', [stepId]);
  if (!Array.isArray(quizzes)) return;
  for (const quiz of quizzes) {
    const prompt = String(quiz.prompt || '').trim();
    if (!prompt) continue;
    const correctIndex = Number(quiz.correctIndex ?? quiz.correct_index ?? 0);
    await db.query(
      `INSERT INTO quiz_questions (step_id, prompt, options_json, correct_index, status)
       VALUES (?, ?, ?, ?, 1)`,
      [stepId, prompt, JSON.stringify(quiz.options || []), correctIndex]
    );
  }
}

module.exports = {
  findTopicById,
  upsertTopic,
  replaceTopicRelations,
  deleteTopic,
  updateTopicApproval,
  findLessonById,
  upsertLesson,
  deleteLesson,
  findStepById,
  upsertStep,
  deleteStep,
  updateStepApproval,
  replaceStepPrerequisites,
  replaceStepBlocks,
  replaceStepQuizzes,
};

