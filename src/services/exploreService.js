const exploreRepo = require('../repositories/exploreRepository');
const { mapUserRow, mapTopicRow, mapStepRow } = require('../utils/apiMappers');
const { ApiError } = require('../middleware/error');

async function searchExplore(query) {
  const q = String(query || '').trim();
  if (!q) {
    return { authors: [], blogs: [], steps: [] };
  }

  const [authorRows, blogRows, stepRows] = await Promise.all([
    exploreRepo.searchAuthors(q),
    exploreRepo.searchBlogs(q),
    exploreRepo.searchSteps(q),
  ]);

  const authors = authorRows.map((r) => ({
    id: String(r.id),
    code: r.code || `USR-${String(r.id).padStart(5, '0')}`,
    username: r.username || '',
    name: r.fullName || r.username || 'Author',
    fullName: r.fullName || r.username || 'Author',
    email: r.email || '',
    description: r.description || '',
    role: 'AUTHOR',
  }));

  const blogs = blogRows.map((t) => mapTopicRow(t));

  const steps = stepRows.map((s) => ({
    ...mapStepRow(s),
    topicTitle: s.topic_title || '',
    lessonTitle: s.lesson_title || '',
    author: s.author_username ? {
      username: s.author_username,
      fullName: s.author_full_name || s.author_username,
    } : null,
  }));

  return { authors, blogs, steps };
}

async function getAuthorProfile(identifier) {
  if (!identifier || !String(identifier).trim()) {
    throw ApiError.badRequest('Author identifier is required');
  }

  const author = await exploreRepo.findAuthorProfile(identifier);
  if (!author) {
    throw ApiError.notFound('Author not found');
  }

  const blogRows = await exploreRepo.findApprovedTopicsByAuthor(author.id);
  const blogs = blogRows.map((t) => mapTopicRow(t));

  return {
    author: {
      id: String(author.id),
      code: author.code || `USR-${String(author.id).padStart(5, '0')}`,
      username: author.username || '',
      name: author.fullName || author.username || 'Author',
      fullName: author.fullName || author.username || 'Author',
      email: author.email || '',
      description: author.description || '',
      role: 'AUTHOR',
    },
    blogs,
  };
}

module.exports = {
  searchExplore,
  getAuthorProfile,
};
