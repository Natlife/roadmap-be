const topicService = require('../services/topicService');
const progressService = require('../services/progressService');
const { successResponse } = require('../utils/baseResponse');
const { asyncHandler, ApiError } = require('../middleware/error');

const getAllTopics = asyncHandler(async (req, res) => {
  const topics = await topicService.getTopicTree(null, req.userId ?? null, req.userRole ?? null);
  res.json(successResponse(topics, 'Fetched all topics successfully'));
});

const getTopicDetail = asyncHandler(async (req, res) => {
  const topics = await topicService.getTopicTree(req.params.topicId, req.userId ?? null, req.userRole ?? null);
  if (topics.length === 0) throw ApiError.notFound('Topic not found');
  res.json(successResponse(topics[0], 'Fetched topic detail successfully'));
});


const getStepDetail = asyncHandler(async (req, res) => {
  const step = await topicService.getStepDetail(req.params.stepId, req.userId ?? null);
  if (!step) throw ApiError.notFound('Step not found');
  res.json(successResponse(step, 'Fetched step detail successfully'));
});

const updateStepProgress = asyncHandler(async (req, res) => {
  const result = await progressService.updateStepProgress({
    stepId: req.params.stepId,
    userId: req.userId ?? null,
    status: req.body.status,
    completedChecklist: req.body.completedChecklist,
  });
  res.json(successResponse(result, 'Updated step progress successfully'));
});

const submitQuiz = asyncHandler(async (req, res) => {
  const result = await progressService.submitQuiz({
    stepId: req.params.stepId,
    userId: req.userId ?? null,
    answers: req.body.answers,
    selectedAnswers: req.body.selectedAnswers,
  });
  res.json(successResponse(result, 'Submitted quiz successfully'));
});

module.exports = {
  getAllTopics,
  getTopicDetail,
  getStepDetail,
  updateStepProgress,
  submitQuiz,
};
