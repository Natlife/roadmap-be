const { config, validateConfig } = require('./src/config/env');
const { createApp } = require('./src/app');
const { initDatabaseSchema } = require('./src/services/seedService');

async function bootstrap() {
  // Fail fast on unsafe production configuration.
  validateConfig();

  // Ensure schema + seed data are present/compatible before serving traffic.
  await initDatabaseSchema();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(
      `🚀 [Hoc Meo Node Backend] Listening on port ${config.port} ` +
        `(http://localhost:${config.port}) [env=${config.env}]`
    );
  });

  // Graceful shutdown so in-flight requests finish and the pool closes cleanly.
  const shutdown = (signal) => {
    console.log(`\n[Shutdown] Received ${signal}, closing server...`);
    server.close(() => {
      console.log('[Shutdown] HTTP server closed. Bye.');
      process.exit(0);
    });
    // Force-exit if it hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  ['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  return server;
}

// Surface programming errors instead of dying silently.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

bootstrap().catch((err) => {
  console.error('❌ [Startup] Failed to start server:', err);
  process.exit(1);
});

module.exports = { bootstrap };
