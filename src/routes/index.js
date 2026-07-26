const express = require('express');

const { authMiddleware } = require('../middleware/auth');
const { successResponse } = require('../utils/baseResponse');
const pool = require('../config/db');
const { asyncHandler } = require('../middleware/error');

const authController = require('../controllers/authController');
const topicController = require('../controllers/topicController');
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');

const router = express.Router();

/* ------------------------------------------------------------------ health */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    let db = false;
    try {
      db = await pool.healthcheck();
    } catch (_) {
      db = false;
    }
    res.json(
      successResponse(
        { status: 'UP', service: 'Hoc Meo Node.js Backend', db: db ? 'UP' : 'DOWN' },
        'Service is healthy'
      )
    );
  })
);

/* -------------------------------------------------------------------- auth */
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);
router.get('/auth/me', authMiddleware(), authController.getMe);

/* ------------------------------------------------------- topics & progress */
router.get('/topics', authMiddleware({ optional: true }), topicController.getAllTopics);
router.get('/topics/:topicId', authMiddleware({ optional: true }), topicController.getTopicDetail);
router.get('/steps/:stepId', authMiddleware({ optional: true }), topicController.getStepDetail);
router.put('/steps/:stepId/progress', authMiddleware(), topicController.updateStepProgress);
router.post('/steps/:stepId/quiz', authMiddleware(), topicController.submitQuiz);

/* ------------------------------------------------------------------- admin */
const admin = express.Router();
admin.use(authMiddleware({ role: 'ADMIN' }));

admin.get('/categories', adminController.getAllCategories);
admin.post('/categories', adminController.createCategory);
admin.put('/categories/:id', adminController.updateCategory);
admin.delete('/categories/:id', adminController.deleteCategory);

admin.get('/tags', adminController.getAllTags);
admin.post('/tags', adminController.createTag);
admin.put('/tags/:id', adminController.updateTag);
admin.delete('/tags/:id', adminController.deleteTag);

admin.post('/topics', adminController.createTopic);
admin.put('/topics/:id', adminController.updateTopic);
admin.delete('/topics/:id', adminController.deleteTopic);

admin.post('/lessons', adminController.createLesson);
admin.put('/lessons/:id', adminController.updateLesson);
admin.delete('/lessons/:id', adminController.deleteLesson);

admin.post('/steps', adminController.createStep);
admin.put('/steps/:id', adminController.updateStep);
admin.delete('/steps/:id', adminController.deleteStep);
admin.put('/steps/:stepId/blocks', adminController.updateStepBlocks);
admin.put('/steps/:stepId/quizzes', adminController.updateStepQuizzes);

admin.get('/groups', adminController.getAllGroups);
admin.get('/groups/:id', adminController.getGroupDetail);
admin.post('/groups', adminController.createGroup);
admin.put('/groups/:id', adminController.updateGroup);
admin.delete('/groups/:id', adminController.deleteGroup);
admin.post('/groups/:groupId/members/:userId', adminController.addMemberToGroup);
admin.delete('/groups/:groupId/members/:userId', adminController.removeMemberFromGroup);

admin.post('/sync', adminController.syncFullAdminData);

router.use('/admin', admin);

/* -------------------------------------------------------------------- users */
router.get('/users', authMiddleware({ role: 'ADMIN' }), userController.getAllUsers);
router.get('/users/:id', authMiddleware(), userController.getUserById);
router.put('/users/:id', authMiddleware(), userController.updateUser);
router.delete('/users/:id', authMiddleware(), userController.deleteUser);

module.exports = router;
