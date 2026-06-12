'use strict';

const express = require('express');
const request = require('supertest');

const mockFind = jest.fn();
const mockCountDocuments = jest.fn();

jest.mock('../models/PostPackage', () => ({
  find: (...args) => mockFind(...args),
  countDocuments: (...args) => mockCountDocuments(...args)
}));

const postsRouter = require('../routes/posts');

function createApp() {
  const app = express();
  app.use('/api/posts', postsRouter);
  app.use((error, req, res, next) => {
    res.status(500).json({ error: error.message });
  });
  return app;
}

function createFindQuery(posts) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(posts)
  };
}

function mockPost(overrides = {}) {
  return {
    title: 'Durable AI Agents',
    slug: 'durable-ai-agents',
    primaryKeyword: 'AI agent testing',
    topicAngle: 'debugging long-running workflows',
    linkedinPost: 'LinkedIn copy',
    xPost: 'X copy',
    ...overrides
  };
}

describe('posts route', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/posts returns default pagination', async () => {
    const posts = Array.from({ length: 12 }, (_, index) => mockPost({ slug: `post-${index + 1}` }));
    const findQuery = createFindQuery(posts);
    mockFind.mockReturnValue(findQuery);
    mockCountDocuments.mockResolvedValue(25);

    const response = await request(app).get('/api/posts').expect(200);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(mockCountDocuments).toHaveBeenCalledWith({});
    expect(findQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(findQuery.skip).toHaveBeenCalledWith(0);
    expect(findQuery.limit).toHaveBeenCalledWith(12);
    expect(response.body).toEqual({
      posts,
      pagination: {
        page: 1,
        limit: 12,
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: false
      }
    });
  });

  test('GET /api/posts supports custom page and limit', async () => {
    const posts = [mockPost({ slug: 'page-two-post' })];
    const findQuery = createFindQuery(posts);
    mockFind.mockReturnValue(findQuery);
    mockCountDocuments.mockResolvedValue(21);

    const response = await request(app).get('/api/posts?page=2&limit=10').expect(200);

    expect(findQuery.skip).toHaveBeenCalledWith(10);
    expect(findQuery.limit).toHaveBeenCalledWith(10);
    expect(response.body.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true
    });
  });

  test('GET /api/posts clamps invalid page and max limit', async () => {
    const findQuery = createFindQuery([]);
    mockFind.mockReturnValue(findQuery);
    mockCountDocuments.mockResolvedValue(100);

    const response = await request(app).get('/api/posts?page=-4&limit=500').expect(200);

    expect(findQuery.skip).toHaveBeenCalledWith(0);
    expect(findQuery.limit).toHaveBeenCalledWith(50);
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 50,
      total: 100,
      totalPages: 2
    });
  });

  test('GET /api/posts searches expected fields with escaped regex input', async () => {
    const posts = [mockPost({ title: 'C++ Build Systems Are Still Spicy', primaryKeyword: 'C++ build systems' })];
    const findQuery = createFindQuery(posts);
    mockFind.mockReturnValue(findQuery);
    mockCountDocuments.mockResolvedValue(1);

    const response = await request(app).get('/api/posts?q=C%2B%2B').expect(200);
    const filter = mockFind.mock.calls[0][0];

    expect(filter.$or).toHaveLength(6);
    expect(filter.$or.map((condition) => Object.keys(condition)[0])).toEqual([
      'title',
      'slug',
      'primaryKeyword',
      'topicAngle',
      'linkedinPost',
      'xPost'
    ]);
    expect(filter.$or[0].title.test('C++ Build Systems Are Still Spicy')).toBe(true);
    expect(filter.$or[0].title.test('CCCC Build Systems')).toBe(false);
    expect(mockCountDocuments).toHaveBeenCalledWith(filter);
    expect(response.body.posts).toEqual(posts);
  });

  test('GET /api/posts returns empty result shape', async () => {
    const findQuery = createFindQuery([]);
    mockFind.mockReturnValue(findQuery);
    mockCountDocuments.mockResolvedValue(0);

    const response = await request(app).get('/api/posts?q=missing').expect(200);

    expect(response.body).toEqual({
      posts: [],
      pagination: {
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      }
    });
  });
});
