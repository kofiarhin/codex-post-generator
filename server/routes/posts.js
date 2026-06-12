'use strict';

const express = require('express');
const PostPackage = require('../models/PostPackage');

const router = express.Router();

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const SEARCH_FIELDS = ['title', 'slug', 'primaryKeyword', 'topicAngle', 'linkedinPost', 'xPost'];

function clampPositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchFilter(query) {
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery) {
    return {};
  }

  const regex = new RegExp(escapeRegex(normalizedQuery), 'i');

  return {
    $or: SEARCH_FIELDS.map((field) => ({ [field]: regex }))
  };
}

router.get('/', async (req, res, next) => {
  try {
    const page = clampPositiveInteger(req.query.page, DEFAULT_PAGE);
    const limit = clampPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const filter = buildSearchFilter(req.query.q);
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      PostPackage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PostPackage.countDocuments(filter)
    ]);
    const totalPages = Math.ceil(total / limit);

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1 && totalPages > 0
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const post = await PostPackage.findOne({ slug: req.params.slug }).lean();

    if (!post) {
      res.status(404).json({ error: 'Post package not found.' });
      return;
    }

    res.json({ post });
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug', async (req, res, next) => {
  try {
    const deleted = await PostPackage.findOneAndDelete({ slug: req.params.slug }).lean();

    if (!deleted) {
      res.status(404).json({ error: 'Post package not found.' });
      return;
    }

    res.json({ deleted: true, slug: req.params.slug });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
