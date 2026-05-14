'use strict';

const fs = require('fs');
const path = require('path');
const { recordStage } = require('./ralph_article_state');

function usageAndExit() {
  console.error(
    'Usage: node record_ralph_stage.js "<Article Title>" "<stage>" "<artifact-input-path>" ["<checks-json-path>"]'
  );
  process.exit(1);
}

function readChecks(checksPath) {
  if (!checksPath) {
    return null;
  }

  const resolvedPath = path.resolve(checksPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Checks JSON file not found: ${resolvedPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  if (!Array.isArray(parsed)) {
    throw new Error('Checks JSON must be an array of objects with name and status fields.');
  }

  return parsed;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    usageAndExit();
  }

  const [title, stageName, artifactInputArg, checksArg] = args;

  try {
    const result = recordStage({
      title,
      stageName,
      artifactInputPath: path.resolve(artifactInputArg),
      checks: readChecks(checksArg)
    });

    console.log(`RALPH_STAGE_RECORDED: ${result.stage}`);
    console.log(`STATUS: ${result.status}`);
    console.log(`NEXT_STAGE: ${result.nextStage || 'complete'}`);
    console.log(`ARTIFACT_FILE: _post_suggestion/${result.slug}/${path.basename(result.outputPath)}`);
    console.log(`STATE_FILE: _post_suggestion/${result.slug}/workflow_state.json`);
    console.log(`SUMMARY_FILE: _post_suggestion/${result.slug}/workflow_summary.json`);

    if (result.status !== 'passed') {
      process.exit(1);
    }
  } catch (error) {
    console.error(`RALPH_STAGE_FAILED: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
