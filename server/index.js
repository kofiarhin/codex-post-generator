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
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: clientOrigin }));
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
