/**
 * Shared parsing / normalization helpers used by validators, repositories
 * and services. Pure functions — safe to unit test without a database.
 */

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Parse a positive integer id, returning null when invalid/absent. */
function toId(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

/** Deduplicated list of valid positive integer ids. */
function toIdList(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(toId).filter((v) => v != null)));
}

function toUpperEnum(value, fallback) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || fallback;
}

/** Convert an arbitrary date-ish value to a MySQL DATETIME string, or null. */
function toMysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Robustly parse a JSON array from a string, array, or nullish value. */
function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/** Clamp a pass threshold into the valid 1..100 range with a sane default. */
function normalizePassThreshold(value, fallback = 70) {
  const parsed = toInt(value, fallback);
  return parsed > 0 && parsed <= 100 ? parsed : fallback;
}

module.exports = {
  toInt,
  toId,
  toIdList,
  toUpperEnum,
  toMysqlDateTime,
  parseJsonArray,
  normalizePassThreshold,
};
