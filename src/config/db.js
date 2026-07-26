const mysql = require('mysql2/promise');
const { config } = require('./env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: config.db.timezone,
  // Keep DECIMAL/BIGINT as strings only when needed; ids here are INT so default is fine.
  namedPlaceholders: false,
});

/**
 * Run a set of queries inside a single transaction.
 * The callback receives a dedicated connection; commit/rollback/release
 * are handled automatically.
 *
 *   await pool.withTransaction(async (conn) => {
 *     await conn.query('INSERT ...');
 *     await conn.query('UPDATE ...');
 *   });
 */
pool.withTransaction = async function withTransaction(fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {
      /* ignore rollback failure, surface the original error */
    }
    throw err;
  } finally {
    connection.release();
  }
};

/** Lightweight health probe used by the /health endpoint. */
pool.healthcheck = async function healthcheck() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
};

// Verify connectivity on boot (non-fatal; the server still starts so the
// operator can see the error and fix the DB without a crash loop).
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(
      `✅ [MySQL] Connected to '${config.db.database}' at ${config.db.host}:${config.db.port}`
    );
    connection.release();
  } catch (err) {
    console.warn(`⚠️ [MySQL] Could not connect on boot: ${err.message}`);
  }
})();

module.exports = pool;
