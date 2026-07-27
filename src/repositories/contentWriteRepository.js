const pool = require('../config/db');
const { toId, toIdList, toUpperEnum } = require('../utils/parse');

/* ------------------------------------------------------------------ topics */

async function upsertTopic(topic, db = pool) {
  const id = toId(topic.id);
  const values = [
    topic.title,
    topic.description || '',
    topic.emoji || 'book',
    topic.levelLabel || 'Beginner',
    topic.estimatedHours || 4,
    toUpperEnum(topic.accessLevel, 'FREE'),
  ];

  if (id != null) {
    await db.query(
      `INSERT INTO topics (id, title, description, emoji, level_label, estimated_hours, access_level, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), description = VALUES(description), emoji = VALUES(emoji),
         level_label = VALUES(level_label), estimated_hours = VALUES(estimated_hours),
         access_level = VALUES(access_level)`,
      [id, ...values]
    );
    return id;
  }

  const [result] = await db.query(
    `INSERT INTO topics (title, description, emoji, level_label, estimated_hours, access_level, status)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    values
  );
  return result.insertId;
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

/* ----------------------------------------------------------------- lessons */

async function upsertLesson(lesson, db = pool) {
  const id = toId(lesson.id);
  const values = [
    lesson.topicId,
    lesson.title,
    lesson.summary || '',
    lesson.orderIndex || 0,
    toUpperEnum(lesson.accessLevel, 'FREE'),
    lesson.estimatedMinutes || 15,
  ];

  if (id != null) {
    await db.query(
      `INSERT INTO lessons (id, topic_id, title, summary, order_index, access_level, estimated_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), summary = VALUES(summary), order_index = VALUES(order_index),
         access_level = VALUES(access_level), estimated_minutes = VALUES(estimated_minutes)`,
      [id, ...values]
    );
    return id;
  }

  const [result] = await db.query(
    `INSERT INTO lessons (topic_id, title, summary, order_index, access_level, estimated_minutes, status)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    values
  );
  return result.insertId;
}

async function deleteLesson(id, db = pool) {
  await db.query('DELETE FROM lessons WHERE id = ?', [id]);
}

/* ------------------------------------------------------------------- steps */

async function upsertStep(step, db = pool) {
  const id = toId(step.id);
  const values = [
    step.lessonId,
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
  ];

  if (id != null) {
    await db.query(
      `INSERT INTO steps
         (id, lesson_id, title, summary, order_index, access_level, note, theory,
          code_snippet, code_language, checklist_json, pass_threshold, estimated_minutes, xp_reward, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), summary = VALUES(summary), order_index = VALUES(order_index),
         access_level = VALUES(access_level), note = VALUES(note), theory = VALUES(theory),
         code_snippet = VALUES(code_snippet), code_language = VALUES(code_language),
         checklist_json = VALUES(checklist_json), pass_threshold = VALUES(pass_threshold),
         estimated_minutes = VALUES(estimated_minutes), xp_reward = VALUES(xp_reward)`,
      [id, ...values]
    );
    return id;
  }

  const [result] = await db.query(
    `INSERT INTO steps
       (lesson_id, title, summary, order_index, access_level, note, theory,
        code_snippet, code_language, checklist_json, pass_threshold, estimated_minutes, xp_reward, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    values
  );
  return result.insertId;
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
  upsertTopic,
  replaceTopicRelations,
  deleteTopic,
  upsertLesson,
  deleteLesson,
  upsertStep,
  deleteStep,
  replaceStepPrerequisites,
  replaceStepBlocks,
  replaceStepQuizzes,
};
