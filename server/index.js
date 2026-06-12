'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { connectMongo, getMongoStatus } = require('./config/db');
const postsRouter = require('./routes/posts');

const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const app = express();
const port = Number(process.env.PORT || 5000);

const defaultClientOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredClientOrigins = process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || defaultClientOrigins.join(',');
const allowedClientOrigins = new Set(
  configuredClientOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isPrivateLanHost(hostname) {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function isAllowedDevOrigin(origin) {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const url = new URL(origin);
    return (
      url.protocol === 'http:' &&
      url.port === '5173' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || isPrivateLanHost(url.hostname))
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedClientOrigins.has(origin) || isAllowedDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  })
);
app.use(express.json({ limit: '1mb' }));
app.use('/post-assets', express.static(path.join(repoRoot, '_post_suggestion')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: getMongoStatus().readyState === 1,
    server: 'ok',
    db: getMongoStatus()
  });
});

app.use('/api/posts', postsRouter);

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error.' : error.message
  });
});

async function startServer() {
  await connectMongo();

  return app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer
};
