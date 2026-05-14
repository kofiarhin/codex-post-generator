'use strict';

const express = require('express');
const PostPackage = require('../models/PostPackage');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const posts = await PostPackage.find({}).sort({ createdAt: -1 }).lean();
    res.json({ posts });
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
