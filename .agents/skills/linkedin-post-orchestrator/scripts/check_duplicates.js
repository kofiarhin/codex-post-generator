'use strict';

const path = require('path');
const { findDuplicateTitle, readLogEntries } = require('./title_log_utils');

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node check_duplicates.js "<Candidate Title>"');
    process.exit(1);
  }

  const candidateTitle = args[0];
  const repoRoot = path.resolve(__dirname, '../../../..');
  const logPath = path.join(repoRoot, 'log.txt');
  const logEntries = readLogEntries(logPath);
  const duplicateMatch = findDuplicateTitle(candidateTitle, logEntries);

  if (!duplicateMatch) {
    console.log(`CLEAR: ${candidateTitle}`);
    console.log('No exact or near-duplicate title found in log.txt.');
    process.exit(0);
  }

  console.log(`POTENTIAL_DUPLICATE: ${candidateTitle}`);
  console.log(`Matched logged title: ${duplicateMatch.existingTitle}`);
  if (duplicateMatch.existingDate) {
    console.log(`Logged date: ${duplicateMatch.existingDate}`);
  }
  if (duplicateMatch.existingPrimaryKeyword && duplicateMatch.existingPrimaryKeyword !== '-') {
    console.log(`Logged keyword: ${duplicateMatch.existingPrimaryKeyword}`);
  }
  if (duplicateMatch.existingTopicAngle && duplicateMatch.existingTopicAngle !== '-') {
    console.log(`Logged angle: ${duplicateMatch.existingTopicAngle}`);
  }
  console.log(`Match reason: ${duplicateMatch.reason}`);
  console.log(
    `Similarity scores — tokenOverlap=${duplicateMatch.tokenOverlap.toFixed(2)}, tokenJaccard=${duplicateMatch.tokenJaccard.toFixed(2)}, bigramJaccard=${duplicateMatch.bigramJaccard.toFixed(2)}`
  );
  process.exit(2);
}

main();
