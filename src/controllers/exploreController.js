const exploreService = require('../services/exploreService');
const { successResponse } = require('../utils/baseResponse');
const { asyncHandler } = require('../middleware/error');


const searchExplore = asyncHandler(async (req, res) => {
  const query = req.query.q ?? req.query.search ?? req.query.query ?? '';
  const result = await exploreService.searchExplore(query);
  res.json(successResponse(result, 'Search completed successfully'));
});

const getAuthorProfile = asyncHandler(async (req, res) => {
  const identifier = req.params.identifier || req.params.username;
  const result = await exploreService.getAuthorProfile(identifier);
  res.json(successResponse(result, 'Author profile fetched successfully'));
});

module.exports = {
  searchExplore,
  getAuthorProfile,
};
