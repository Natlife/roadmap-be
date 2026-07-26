const path = require('path');
const express = require('express');
const cors = require('cors');

const { config } = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    })
  );

  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ limit: config.bodyLimit, extended: true }));

  // Static uploads (kept compatible with the previous mount point).
  app.use('/upload', express.static(path.join(__dirname, '..', 'upload')));

  // All API routes live under /api/v1.
  app.use('/api/v1', routes);

  // 404 + centralized error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
