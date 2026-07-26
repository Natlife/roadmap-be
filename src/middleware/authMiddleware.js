/**
 * Backward-compatibility shim.
 * The auth middleware now lives in ./auth.js. This file is kept so any lingering
 * import of the old path keeps working. Prefer requiring './auth' directly.
 */
module.exports = require('./auth');
