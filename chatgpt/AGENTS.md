# ChatGPT LinkedIn Post Generator

This directory contains the authoritative instructions for the ChatGPT Post Generator. It is separate from the repository-root AGENTS.md and the existing Codex application workflow.

Before drafting a LinkedIn post, read these files from the current default branch:
- content-strategy.md — topic mix, diversity, evidence, performance
- linkedin-writing-voice.md — structure and voice
- unslop.md — final quality review
- post-examples.md — examples and their evidence status
- linkedin-thumbnail-style.md — only when creating a thumbnail

Use the repository files as the current editorial source of truth. Do not treat this file as authorization to publish, modify GitHub, or disclose private project details. If GitHub access fails, say the current rules could not be retrieved.

For `generate post`, research recent developments, select a distinct practical engineering topic, write and fact-check the post, and generate the matching thumbnail unless text-only was requested. Follow the detailed files above.

## Topic Learning Loop

Before choosing a topic, read `chatgpt/data/post-history.json` from the current default branch. Compare topic, problem, mechanism, and angle; avoid repeating the same thesis. A subject may return with a genuinely different engineering mechanism.

After a complete, successful post generation, create one metadata-only record using the schema in `chatgpt/data/README.md`. Do not save the full post. Mark status `generated` until publication is confirmed. Preserve all prior records and avoid duplicate entries.

Only perform the GitHub write when the current ChatGPT Project Instructions and permissions explicitly authorize automatic metadata logging. Otherwise ask for approval and do not silently write. Report whether logging succeeded or was skipped. A failed log must not be described as saved.
