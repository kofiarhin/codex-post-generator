'use strict';

const { createSeoThumbnailFileName } = require('../utils/seoThumbnailFileName');

describe('createSeoThumbnailFileName', () => {
  test('creates the expected filename from a finalized post title', () => {
    expect(createSeoThumbnailFileName('WSL Containers Could Make Windows Development Boring')).toBe(
      'wsl-containers-could-make-windows-development-boring'
    );
  });

  test('removes punctuation, emojis, and repeated separators without adding an extension', () => {
    const fileName = createSeoThumbnailFileName('  Ship It! 🚀 -- Without Drama  ');

    expect(fileName).toBe('ship-it-without-drama');
    expect(fileName).not.toMatch(/\.(png|jpe?g|webp)$/);
  });

  test('returns an empty filename for a missing title', () => {
    expect(createSeoThumbnailFileName()).toBe('');
  });
});
