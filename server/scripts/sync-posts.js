'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { disconnectMongo } = require('../config/db');
const { syncAllPostPackages } = require('../utils/packagePersistence');

const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

async function main() {
  try {
    const posts = await syncAllPostPackages({ repoRoot });
    console.log(`Synced ${posts.length} post package${posts.length === 1 ? '' : 's'} to MongoDB.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await disconnectMongo();
  }
}

if (require.main === module) {
  main();
}
