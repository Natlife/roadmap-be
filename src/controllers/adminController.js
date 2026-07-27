const adminService = require('../services/adminService');
const { successResponse } = require('../utils/baseResponse');
const { asyncHandler } = require('../middleware/error');
const { toStatus } = require('../utils/taxonomyValidation');

/** Merge an id coming from the route params with the request body. */
function withId(req) {
  return { ...req.body, id: req.params.id ?? req.body.id };
}

/* --------------------------------------------------------------- categories */
const getAllCategories = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.categories.list({ search: req.query.search, status: toStatus(req.query.status) }), 'Fetched all categories'))
);
const createCategory = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.categories.create(req.body), 'Category created successfully'))
);
const updateCategory = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.categories.update(req.params.id, req.body), 'Category updated successfully'))
);
const deleteCategory = asyncHandler(async (req, res) => {
  await adminService.categories.remove(req.params.id, { force: req.query.force === 'true' });
  res.json(successResponse(null, 'Category deleted successfully'));
});

/* --------------------------------------------------------------------- tags */
const getAllTags = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.tags.list({ search: req.query.search, status: toStatus(req.query.status) }), 'Fetched all tags'))
);
const createTag = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.tags.create(req.body), 'Tag created successfully'))
);
const updateTag = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.tags.update(req.params.id, req.body), 'Tag updated successfully'))
);
const deleteTag = asyncHandler(async (req, res) => {
  await adminService.tags.remove(req.params.id, { force: req.query.force === 'true' });
  res.json(successResponse(null, 'Tag deleted successfully'));
});

/* ------------------------------------------------------------------- topics */
const createTopic = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.saveTopic(withId(req)), 'Topic saved successfully'))
);
const deleteTopic = asyncHandler(async (req, res) => {
  await adminService.deleteTopic(req.params.id);
  res.json(successResponse(null, 'Topic deleted successfully'));
});

/* ------------------------------------------------------------------ lessons */
const createLesson = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.saveLesson(withId(req)), 'Lesson saved successfully'))
);
const deleteLesson = asyncHandler(async (req, res) => {
  await adminService.deleteLesson(req.params.id);
  res.json(successResponse(null, 'Lesson deleted successfully'));
});

/* -------------------------------------------------------------------- steps */
const createStep = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.saveStep(withId(req)), 'Step saved successfully'))
);
const deleteStep = asyncHandler(async (req, res) => {
  await adminService.deleteStep(req.params.id);
  res.json(successResponse(null, 'Step deleted successfully'));
});
const updateStepBlocks = asyncHandler(async (req, res) => {
  await adminService.updateStepBlocks(req.params.stepId, req.body);
  res.json(successResponse(null, 'Step blocks updated successfully'));
});
const updateStepQuizzes = asyncHandler(async (req, res) => {
  await adminService.updateStepQuizzes(req.params.stepId, req.body);
  res.json(successResponse(null, 'Step quiz questions updated successfully'));
});

/* ------------------------------------------------------------------- groups */
const getAllGroups = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.listGroups(), 'Fetched all groups successfully'))
);
const getGroupDetail = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.getGroup(req.params.id), 'Fetched group details successfully'))
);
const createGroup = asyncHandler(async (req, res) =>
  res.json(successResponse(await adminService.saveGroup(withId(req)), 'Group saved successfully'))
);
const deleteGroup = asyncHandler(async (req, res) => {
  await adminService.deleteGroup(req.params.id);
  res.json(successResponse(null, 'Group deleted successfully'));
});
const addMemberToGroup = asyncHandler(async (req, res) => {
  await adminService.addMember(req.params.groupId, req.params.userId);
  res.json(successResponse(null, 'Member added to group successfully'));
});
const removeMemberFromGroup = asyncHandler(async (req, res) => {
  await adminService.removeMember(req.params.groupId, req.params.userId);
  res.json(successResponse(null, 'Member removed from group successfully'));
});

/* --------------------------------------------------------------------- sync */
const syncFullAdminData = asyncHandler(async (req, res) => {
  await adminService.syncFullData(req.body);
  res.json(successResponse(null, 'Full admin data synchronized to MySQL successfully'));
});

/* ------------------------------------------------------------------ gdrive */
const { parseGDriveFolder } = require('../services/gdriveFolderParser');
const { parsePdfSlides } = require('../services/pdfSlideParser');

const parseGDriveFolderController = asyncHandler(async (req, res) => {
  const { url } = req.body;
  const data = await parseGDriveFolder(url);
  res.json(successResponse(data, `Extracted ${data.count} image links from Google Drive folder`));
});

const parsePdfSlidesController = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    throw new (require('../middleware/error').ApiError)(400, 'PDF file is required (field name: "file")');
  }
  const data = await parsePdfSlides(req.file.buffer);
  res.json(successResponse(data, `Parsed ${data.numPages} slides from PDF`));
});

const fs = require('fs');
const path = require('path');

const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

const uploadImagesController = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  if (!files || files.length === 0) {
    throw new (require('../middleware/error').ApiError)(400, 'No image files uploaded (field name: "files")');
  }

  // Validate image file formats
  for (const file of files) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isMimeImage = file.mimetype && file.mimetype.startsWith('image/');
    const isExtImage = ALLOWED_IMAGE_EXTS.includes(ext);

    if (!isMimeImage && !isExtImage) {
      throw new (require('../middleware/error').ApiError)(
        400,
        `File "${file.originalname}" is not a valid image. Only PNG, JPG, JPEG, WEBP, GIF, SVG formats are allowed.`
      );
    }
  }

  const uploadDir = path.join(__dirname, '..', '..', 'upload', 'slides');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const filename = `img_${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);
    urls.push(`/upload/slides/${filename}`);
  }

  res.json(successResponse({ count: urls.length, urls }, `Uploaded ${urls.length} images successfully`));
});


module.exports = {
  getAllCategories, createCategory, updateCategory, deleteCategory,
  getAllTags, createTag, updateTag, deleteTag,
  createTopic, updateTopic: createTopic, deleteTopic,
  createLesson, updateLesson: createLesson, deleteLesson,
  createStep, updateStep: createStep, deleteStep, updateStepBlocks, updateStepQuizzes,
  getAllGroups, getGroupDetail, createGroup, updateGroup: createGroup, deleteGroup,
  addMemberToGroup, removeMemberFromGroup,
  syncFullAdminData,
  parseGDriveFolder: parseGDriveFolderController,
  parsePdfSlides: parsePdfSlidesController,
  uploadImages: uploadImagesController,
};



