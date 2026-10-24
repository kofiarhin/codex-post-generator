'use strict';

const mongoose = require('mongoose');
let connectedUri;

function mongoUriFromEnv(env = process.env) {
  if (env.MONGO_URI && env.MONGODB_URI && env.MONGO_URI !== env.MONGODB_URI) {
    throw new Error('Conflicting MONGO_URI and MONGODB_URI configuration.');
  }
  return env.MONGO_URI || env.MONGODB_URI;
}

async function connectMongo({ mongoUri = mongoUriFromEnv() } = {}) {
  if (!mongoUri) {
    throw new Error('MONGO_URI is required (MONGODB_URI remains supported).');
  }

  if (mongoose.connection.readyState === 1) {
    if (connectedUri !== mongoUri) {
      throw new Error('Existing MongoDB connection does not match the requested configuration.');
    }
    return mongoose.connection;
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    connectedUri = mongoUri;
  } catch {
    throw new Error('MongoDB connection failed.');
  }
  return mongoose.connection;
}

async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  connectedUri = undefined;
}

function getMongoStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    readyState: mongoose.connection.readyState,
    status: states[mongoose.connection.readyState] || 'unknown'
  };
}

module.exports = {
  mongoUriFromEnv,
  connectMongo,
  disconnectMongo,
  getMongoStatus
};
