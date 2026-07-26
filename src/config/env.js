/**
 * Centralized, validated environment configuration.
 * Load this instead of reading process.env directly across the codebase.
 */
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const DEFAULT_JWT_SECRET =
  'c2VjdXJpdHktYmFzZS1wcm9qZWN0LXNlY3JldC1rZXktZm9yLWp3dC1zaWduaW5nLXByb2R1Y3Rpb24tZ3JhZGU=';

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const config = {
  env: NODE_ENV,
  isProd: IS_PROD,
  port: toInt(process.env.PORT || process.env.SERVER_PORT, 5001),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  bodyLimit: process.env.BODY_LIMIT || '50mb',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'hocmeo',
    connectionLimit: toInt(process.env.DB_POOL_LIMIT, 20),
    timezone: process.env.DB_TIMEZONE || '+07:00',
  },

  jwt: {
    secret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    usingDefaultSecret: !process.env.JWT_SECRET,
  },

  seed: {
    enableCanva: toBool(process.env.ENABLE_CANVA_SEED, false),
    // Seed the built-in admin/user accounts. Kept on by default to preserve
    // existing behaviour; set ENABLE_DEMO_ACCOUNTS=false once you have created
    // real accounts and rotated the default password.
    enableDemoAccounts: toBool(process.env.ENABLE_DEMO_ACCOUNTS, true),
    adminPassword: process.env.ADMIN_SEED_PASSWORD || process.env.DEMO_ACCOUNT_PASSWORD || '123456',
  },
};

/**
 * Validate critical configuration. Throws in production if unsafe,
 * warns in development so local setup stays frictionless.
 */
function validateConfig() {
  const fatal = [];
  const warnings = [];

  // Fatal: an unset JWT secret in production means everyone shares a public key.
  if (config.isProd && config.jwt.usingDefaultSecret) {
    fatal.push('JWT_SECRET is not set — the built-in default key is public and unsafe in production.');
  }
  if (!config.db.database) {
    fatal.push('DB_NAME is empty.');
  }

  // Non-fatal: worth flagging but should not stop the server from booting.
  if (config.isProd && config.corsOrigin === '*') {
    warnings.push('CORS_ORIGIN is "*" in production — consider restricting it to your real front-end origin(s).');
  }
  if (config.isProd && config.seed.enableDemoAccounts) {
    warnings.push('Demo accounts are enabled in production — set ENABLE_DEMO_ACCOUNTS=false and rotate ADMIN_SEED_PASSWORD once real accounts exist.');
  }

  if (warnings.length > 0) {
    console.warn(`⚠️ [Config] ${warnings.join('\n⚠️ [Config] ')}`);
  }
  if (fatal.length > 0) {
    throw new Error(`[Config] Fatal configuration problems:\n  - ${fatal.join('\n  - ')}`);
  }
}

module.exports = { config, validateConfig };
