function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeAccessLevel(value) {
  const normalized = String(value || 'FREE').trim().toUpperCase();
  switch (normalized) {
    case 'REWARDED':
    case 'PREMIUM':
    case 'GROUP':
      return normalized;
    default:
      return 'FREE';
  }
}

function normalizeLearningPlan(value) {
  const normalized = String(value || 'FREE').trim().toUpperCase();
  switch (normalized) {
    case 'PREMIUM':
    case 'GROUP':
    case 'GROUPPRO':
    case 'GROUP_PRO':
      return 'GROUP';
    default:
      return 'FREE';
  }
}

function normalizeProgressStatus(value) {
  const normalized = String(value || 'NOT_STARTED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, '');

  switch (normalized) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'INPROGRESS':
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'LOCKED':
    case 'NOTSTARTED':
    case 'NOT_STARTED':
    default:
      return 'NOT_STARTED';
  }
}

function normalizeRole(value) {
  const normalized = String(value || 'ROLE_USER').trim().toUpperCase();
  if (normalized === 'ROLE_ADMIN' || normalized === 'ADMIN') {
    return 'ADMIN';
  }
  return 'USER';
}

function toStringId(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function mapCategoryRow(row) {
  return {
    id: toStringId(row.id),
    title: row.title || '',
    description: row.description || '',
    subtitle: row.description || '',
    icon: 'school',
    status: toInt(row.status, 1),
  };
}

function mapTagRow(row) {
  return {
    id: toStringId(row.id),
    title: row.title || '',
    description: row.description || '',
    subtitle: row.description || '',
    icon: 'tag',
    status: toInt(row.status, 1),
  };
}

function mapContentBlockRow(row) {
  return {
    id: toStringId(row.id),
    stepId: toStringId(row.step_id ?? row.stepId),
    type: String(row.block_type || row.type || 'PARAGRAPH').trim().toUpperCase(),
    title: row.title || '',
    body: row.body || '',
    items: parseJsonArray(row.items_json ?? row.items),
    mediaUrl: row.media_url || row.mediaUrl || '',
    caption: row.caption || '',
    codeLanguage: row.code_language || row.codeLanguage || '',
    orderIndex: toInt(row.order_index ?? row.orderIndex, 0),
    status: toInt(row.status, 1),
  };
}

function mapQuizQuestionRow(row) {
  return {
    id: toStringId(row.id),
    stepId: toStringId(row.step_id ?? row.stepId),
    prompt: row.prompt || '',
    options: parseJsonArray(row.options_json ?? row.options),
    correctIndex: toInt(row.correct_index ?? row.correctIndex, 0),
    status: toInt(row.status, 1),
  };
}

function mapStepRow(row, options = {}) {
  const quizQuestions = options.quizQuestions || [];
  const progressStatus = normalizeProgressStatus(options.progressStatus ?? row.progress_status);
  const completedChecklist = parseJsonArray(
    options.completedChecklist ?? row.completed_checklist_json ?? row.completedChecklist
  );
  const quizScore = toInt(options.quizScore ?? row.quiz_score ?? row.quizScore, 0);

  return {
    id: toStringId(row.id),
    lessonId: toStringId(row.lesson_id ?? row.lessonId),
    title: row.title || '',
    summary: row.summary || '',
    description: row.summary || row.description || '',
    emoji: row.emoji || 'book',
    orderIndex: toInt(row.order_index ?? row.orderIndex, 0),
    order: toInt(row.order_index ?? row.orderIndex ?? row.order, 0),
    accessLevel: normalizeAccessLevel(row.access_level ?? row.accessLevel),
    allowedGroupIds: options.allowedGroupIds || [],
    prerequisiteStepIds: (options.prerequisiteStepIds || []).map((item) => toStringId(item)),
    checklist: parseJsonArray(row.checklist_json ?? row.checklist),
    note: row.note || '',
    theory: row.theory || '',
    codeSnippet: row.code_snippet || row.codeSnippet || '',
    codeLanguage: row.code_language || row.codeLanguage || '',
    contentBlocks: (options.contentBlocks || []).map(mapContentBlockRow),
    quizQuestions: quizQuestions.map(mapQuizQuestionRow),
    quiz: {
      passThreshold: toInt(row.pass_threshold ?? row.passThreshold, 70),
      questions: quizQuestions.map(mapQuizQuestionRow),
    },
    passThreshold: toInt(row.pass_threshold ?? row.passThreshold, 70),
    estimatedMinutes: toInt(row.estimated_minutes ?? row.estimatedMinutes, 10),
    xpReward: toInt(row.xp_reward ?? row.xpReward, 20),
    progressStatus,
    completedChecklist,
    quizScore,
    completed: progressStatus === 'COMPLETED',
    status: toInt(row.status, 1),
  };
}

function mapLessonRow(row, options = {}) {
  const steps = options.steps || [];
  const completedStepsCount = steps.filter((step) => step.progressStatus === 'COMPLETED').length;

  return {
    id: toStringId(row.id),
    topicId: toStringId(row.topic_id ?? row.topicId),
    title: row.title || '',
    summary: row.summary || '',
    description: row.summary || row.description || '',
    orderIndex: toInt(row.order_index ?? row.orderIndex, 0),
    order: toInt(row.order_index ?? row.orderIndex ?? row.order, 0),
    accessLevel: normalizeAccessLevel(row.access_level ?? row.accessLevel),
    allowedGroupIds: options.allowedGroupIds || [],
    estimatedMinutes: toInt(row.estimated_minutes ?? row.estimatedMinutes, 15),
    steps,
    completedStepsCount,
    totalStepsCount: steps.length,
    status: toInt(row.status, 1),
  };
}

function mapTopicRow(row, options = {}) {
  const lessons = options.lessons || [];
  const allSteps = lessons.flatMap((lesson) => lesson.steps || []);
  const completedStepsCount = allSteps.filter((step) => step.progressStatus === 'COMPLETED').length;
  const totalStepsCount = allSteps.length;

  return {
    id: toStringId(row.id),
    title: row.title || '',
    description: row.description || '',
    emoji: row.emoji || 'book',
    levelLabel: row.level_label || row.levelLabel || 'Beginner',
    estimatedHours: toInt(row.estimated_hours ?? row.estimatedHours, 0),
    accessLevel: normalizeAccessLevel(row.access_level ?? row.accessLevel),
    categoryIds: (options.categories || []).map((item) => toStringId(item.id)),
    categories: (options.categories || []).map(mapCategoryRow),
    tagIds: (options.tags || []).map((item) => toStringId(item.id)),
    tags: (options.tags || []).map(mapTagRow),
    lessons,
    completedStepsCount,
    totalStepsCount,
    progressPercent: totalStepsCount === 0
      ? 0
      : Math.round((completedStepsCount / totalStepsCount) * 100),
    status: toInt(row.status, 1),
  };
}

function mapLearningGroupRow(row, options = {}) {
  return {
    id: toStringId(row.id),
    title: row.title || '',
    description: row.description || '',
    expiredAt: row.expired_at || row.expiredAt || null,
    grantedTopicIds: (options.grantedTopicIds || []).map((item) => toStringId(item)),
    memberIds: (options.memberIds || []).map((item) => toStringId(item)),
    status: toInt(row.status, 1),
  };
}

function mapUserRow(row, options = {}) {
  const groups = options.groups || [];
  return {
    id: toStringId(row.id),
    username: row.username || row.user_name || '',
    name: row.fullName || row.full_name || row.name || row.user_name || 'Learning Student',
    fullName: row.fullName || row.full_name || row.name || row.user_name || 'Learning Student',
    email: row.email || '',
    plan: normalizeLearningPlan(row.plan),
    active: row.active === undefined ? true : Boolean(row.active),
    streakDays: toInt(row.streakDays ?? row.streak_days, 0),
    completedStepsCount: toInt(row.completedStepsCount ?? row.completed_steps_count, 0),
    role: normalizeRole(row.role || row.role_name),
    groupIds: groups.map((group) => toStringId(group.id)),
    groups,
  };
}

module.exports = {
  parseJsonArray,
  normalizeAccessLevel,
  normalizeLearningPlan,
  normalizeProgressStatus,
  normalizeRole,
  mapCategoryRow,
  mapTagRow,
  mapContentBlockRow,
  mapQuizQuestionRow,
  mapStepRow,
  mapLessonRow,
  mapTopicRow,
  mapLearningGroupRow,
  mapUserRow,
};
