'use strict';

const path = require('path');
const { finalizePostPackage } = require('./finalize_post_package');

function usageAndExit() {
  console.error(
    'Usage: node generate_post.js "<Post Title>" "<linkedin-input-path>" "<x-input-path>" "<prompt-input-path>" ["<primary-keyword>"] ["<topic-angle>"]'
  );
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    usageAndExit();
  }

  const [title, linkedinInputArg, xInputArg, promptInputArg, primaryKeyword = '', topicAngle = ''] = args;

  try {
    const result = finalizePostPackage({
      title,
      linkedinInputPath: path.resolve(linkedinInputArg),
      xInputPath: path.resolve(xInputArg),
      promptInputPath: path.resolve(promptInputArg),
      primaryKeyword,
      topicAngle
    });

    console.log(`GENERATE_POST_COMPLETE: ${result.slug}`);
    console.log(`PROOF_FILE: _post_suggestion/${result.slug}/workflow_receipts.json`);
    console.log(`LINKEDIN_FILE: _post_suggestion/${result.slug}/linkedin_post.txt`);
    console.log(`X_FILE: _post_suggestion/${result.slug}/x_post.txt`);
    console.log(`PROMPT_FILE: _post_suggestion/${result.slug}/prompt.txt`);
    console.log(`LOG_ENTRY: ${result.loggedLine}`);
  } catch (error) {
    console.error(`GENERATE_POST_FAILED: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
