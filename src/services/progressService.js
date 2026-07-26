const pool = require('../config/db');
const progressRepo = require('../repositories/progressRepository');
const readRepo = require('../repositories/topicReadRepository');
const { ApiError } = require('../middleware/error');
const { normalizePassThreshold } = require('../utils/parse');

/** Normalize an incoming status string to a canonical DB value. */
function toDbStatus(status, fallback = 'IN_PROGRESS') {
  const normalized = String(status || '').trim().toUpperCase().replace(/[^A-Z_]/g, '');
  switch (normalized) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'NOTSTARTED':
    case 'NOT_STARTED':
    case 'LOCKED':
      return 'NOT_STARTED';
    case 'INPROGRESS':
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    default:
      return fallback;
  }
}

async function updateStepProgress({ stepId, userId, status, completedChecklist }) {
  if (!userId) throw ApiError.unauthorized('Please sign in to save progress');

  const step = await readRepo.findStepById(stepId);
  if (!step) throw ApiError.notFound('Step not found');

  const checklist = Array.isArray(completedChecklist) ? completedChecklist : [];
  const fallback = checklist.length > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
  const dbStatus = toDbStatus(status, fallback);

  const completedStepsCount = await pool.withTransaction(async (conn) => {
    await progressRepo.upsertStatus(
      {
        userId,
        stepId,
        progressStatus: dbStatus,
        completedChecklistJson: JSON.stringify(checklist),
      },
      conn
    );
    return progressRepo.syncCompletedStepsCount(userId, conn);
  });

  const saved = await progressRepo.findByUserAndStep(userId, stepId);
  const passThreshold = normalizePassThreshold(step.pass_threshold);

  return {
    progressStatus: saved.progressStatus,
    completedChecklist: saved.completedChecklist,
    quizScore: saved.quizScore,
    hasPassedQuiz: saved.progressStatus === 'COMPLETED' && saved.quizScore >= passThreshold,
    completedStepsCount,
    updatedAt: new Date().toISOString(),
  };
}

function gradeQuiz(questions, { answers, selectedAnswers }) {
  let correctCount = 0;
  questions.forEach((question, index) => {
    let selected;
    if (Array.isArray(selectedAnswers)) {
      selected = selectedAnswers[index];
    } else if (answers) {
      selected =
        answers[question.id] ?? answers[String(question.id)] ?? answers[`q-${index}`];
    }
    if (selected === question.correct_index) correctCount += 1;
  });
  return correctCount;
}

async function submitQuiz({ stepId, userId, answers, selectedAnswers }) {
  if (!userId) throw ApiError.unauthorized('Please sign in to submit the quiz');

  const step = await readRepo.findStepById(stepId);
  if (!step) throw ApiError.notFound('Step not found');

  const questions = await readRepo.findQuizzesForSteps([stepId]);
  const totalQuestions = questions.length;
  const correctCount = gradeQuiz(questions, { answers, selectedAnswers });

  const calculatedScore =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
  const passThreshold = normalizePassThreshold(step.pass_threshold);
  const passed = totalQuestions === 0 || calculatedScore >= passThreshold;
  const dbStatus = passed ? 'COMPLETED' : 'IN_PROGRESS';

  const existing = await progressRepo.findByUserAndStep(userId, stepId);

  const completedStepsCount = await pool.withTransaction(async (conn) => {
    await progressRepo.upsertQuizResult(
      {
        userId,
        stepId,
        progressStatus: dbStatus,
        quizScore: calculatedScore,
        completedChecklistJson: JSON.stringify(existing.completedChecklist || []),
      },
      conn
    );
    return progressRepo.syncCompletedStepsCount(userId, conn);
  });

  const saved = await progressRepo.findByUserAndStep(userId, stepId);
  const hasPassedQuiz = saved.progressStatus === 'COMPLETED' && saved.quizScore >= passThreshold;

  return {
    progressStatus: saved.progressStatus,
    completedChecklist: saved.completedChecklist,
    quizScore: saved.quizScore,
    hasPassedQuiz,
    passed: hasPassedQuiz,
    score: saved.quizScore,
    totalQuestions,
    correctCount,
    passThreshold,
    completedStepsCount,
  };
}

module.exports = { updateStepProgress, submitQuiz };
