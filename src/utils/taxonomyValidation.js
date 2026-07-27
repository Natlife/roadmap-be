const { ApiError } = require('../middleware/error');

const TITLE_MAX = 100;
const DESC_MAX = 500;

class FieldErrors {
  constructor() { this.errors = {}; }
  add(f, m) { if (!this.errors[f]) this.errors[f] = m; return this; }
  get isEmpty() { return Object.keys(this.errors).length === 0; }
  throwIfAny() { if (!this.isEmpty) throw ApiError.badRequest('Validation failed', { fields: this.errors }); }
}

// status accepts 1/0, true/false, "active"/"inactive"
function toStatus(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'active', 'yes'].includes(s)) return 1;
  if (['0', 'false', 'inactive', 'no'].includes(s)) return 0;
  return undefined;
}

function validateCreate(body) {
  const fe = new FieldErrors();
  const title = String(body.title ?? '').trim();
  const description = body.description != null ? String(body.description).trim() : '';
  const status = toStatus(body.status);

  if (!title) fe.add('title', 'Title is required');
  else if (title.length > TITLE_MAX) fe.add('title', `Title is too long (max ${TITLE_MAX})`);
  if (description.length > DESC_MAX) fe.add('description', `Description is too long (max ${DESC_MAX})`);
  fe.throwIfAny();

  return { title, description, status: status === undefined ? 1 : status };
}

function validateUpdate(body) {
  const fe = new FieldErrors();
  const out = {};
  if (body.title !== undefined) {
    const title = String(body.title ?? '').trim();
    if (!title) fe.add('title', 'Title cannot be empty');
    else if (title.length > TITLE_MAX) fe.add('title', `Title is too long (max ${TITLE_MAX})`);
    else out.title = title;
  }
  if (body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    if (description.length > DESC_MAX) fe.add('description', `Description is too long (max ${DESC_MAX})`);
    else out.description = description;
  }
  if (body.status !== undefined) {
    const status = toStatus(body.status);
    if (status === undefined) fe.add('status', 'Status must be active or inactive');
    else out.status = status;
  }
  fe.throwIfAny();
  return out;
}

module.exports = { validateCreate, validateUpdate, toStatus, TITLE_MAX, DESC_MAX };
