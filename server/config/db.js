'use strict';

const mongoose = require('mongoose');

async function connectMongo({ mongoUri = process.env.MONGODB_URI } = {}) {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

function getMongoStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    readyState: mongoose.connection.readyState,
    status: states[mongoose.connection.readyState] || 'unknown'
  };
}

module.exports = {
  connectMongo,
  disconnectMongo,
  getMongoStatus
};
