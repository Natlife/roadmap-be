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

const exploreController = require('../controllers/exploreController');

/* ----------------------------------------------------------------- explore */
router.get('/explore/search', authMiddleware({ optional: true }), exploreController.searchExplore);
router.get('/explore/authors/:identifier', authMiddleware({ optional: true }), exploreController.getAuthorProfile);
router.get('/authors/:identifier', authMiddleware({ optional: true }), exploreController.getAuthorProfile);

/* -------------------------------------------------------- categories & tags */
router.get('/categories', authMiddleware({ optional: true }), adminController.getAllCategories);
router.get('/tags', authMiddleware({ optional: true }), adminController.getAllTags);



const planRequestController = require('../controllers/planRequestController');

/* ----------------------------------------------------------- plan requests */
router.post('/plan-requests', authMiddleware({ optional: true }), planRequestController.createRequest);
router.get('/plan-requests/my', authMiddleware(), planRequestController.getMyRequests);

/* ----------------------------------------------------------- author / admin content */
const author = express.Router();
author.use(authMiddleware({ roles: ['ADMIN', 'AUTHOR'] }));

author.post('/topics', adminController.createTopic);
author.put('/topics/:id', adminController.updateTopic);
author.delete('/topics/:id', adminController.deleteTopic);

author.post('/lessons', adminController.createLesson);
author.put('/lessons/:id', adminController.updateLesson);
author.delete('/lessons/:id', adminController.deleteLesson);

author.post('/steps', adminController.createStep);
author.put('/steps/:id', adminController.updateStep);
author.delete('/steps/:id', adminController.deleteStep);
author.put('/steps/:stepId/blocks', adminController.updateStepBlocks);
author.put('/steps/:stepId/quizzes', adminController.updateStepQuizzes);

router.use('/author', author);

/* ------------------------------------------------------------------- admin */
const admin = express.Router();
admin.use(authMiddleware({ role: 'ADMIN' }));

admin.get('/approvals', adminController.getPendingApprovals);
admin.post('/approvals/topics/:id/approve', adminController.approveTopic);
admin.post('/approvals/topics/:id/reject', adminController.rejectTopic);
admin.post('/approvals/steps/:id/approve', adminController.approveStep);
admin.post('/approvals/steps/:id/reject', adminController.rejectStep);

admin.get('/plan-requests', planRequestController.getAllRequests);
admin.patch('/plan-requests/:id', planRequestController.updateStatus);

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

const multer = require('multer');
const uploadRam = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

admin.post('/gdrive/parse-folder', adminController.parseGDriveFolder);
admin.post('/slides/parse-pdf', uploadRam.single('file'), adminController.parsePdfSlides);
admin.post('/upload/images', uploadRam.array('files', 100), adminController.uploadImages);
admin.post('/sync', adminController.syncFullAdminData);

// admin user management (create). read/update/delete live under /users below.
admin.post('/users', userController.createUser);

router.use('/admin', admin);


/* -------------------------------------------------------------------- users */
router.get('/users', authMiddleware({ role: 'ADMIN' }), userController.getAllUsers);
router.get('/users/:id', authMiddleware(), userController.getUserById);
router.put('/users/:id', authMiddleware(), userController.updateUser);
router.delete('/users/:id', authMiddleware(), userController.deleteUser);

module.exports = router;
