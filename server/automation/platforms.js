'use strict';

// An omitted selection preserves the existing two-platform workflow and legacy records.
function platformsFor(platform) {
  if (platform === undefined) return ['linkedin', 'x'];
  if (platform === 'linkedin') return ['linkedin'];
  throw new Error('Invalid platform selection');
}

module.exports = { platformsFor };
