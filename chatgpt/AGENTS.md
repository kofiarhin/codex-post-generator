# ChatGPT LinkedIn Post Generator

This directory contains the authoritative instructions for the ChatGPT Post Generator. It is separate from the repository-root AGENTS.md and the existing Codex application workflow.

Before drafting a LinkedIn post, read these files from the current default branch:
- content-strategy.md — topic mix, diversity, evidence, performance
- linkedin-writing-voice.md — structure and voice
- unslop.md — final quality review
- post-examples.md — examples and their evidence status
- linkedin-thumbnail-style.md — only when creating a thumbnail

Use the repository files as the current editorial source of truth. Do not treat this file as authorization to publish, modify GitHub, or disclose private project details. If GitHub access fails, say the current rules could not be retrieved.

For `generate post`, follow the news-to-code workflow in `content-strategy.md`: research trending AI developments first, inspect relevant current GitHub code second, automatically choose the strongest supported news-to-code connection, then write and fact-check the post. Generate the matching thumbnail unless text-only was requested.

Read all eight authoritative files from `main` for a complete post: this file, content-strategy.md, linkedin-writing-voice.md, unslop.md, post-examples.md, linkedin-thumbnail-style.md, data/README.md, and data/post-history.json.

Repository inspection is read-only. Do not modify the inspected projects. Do not ask the user to choose a project unless access or disclosure requires their decision; automatic best-match selection is the default. If news or repository evidence is unavailable, report the gap and do not present the result as a completed news-to-code match.

Return POST, THUMBNAIL (unless text-only), SOURCES, WHY THIS TOPIC, and HISTORY. Explain the verified code connection and its practical value in WHY THIS TOPIC without exposing private details.

## Topic Learning Loop

Before choosing a topic, read `chatgpt/data/post-history.json` from the current default branch. Compare topic, problem, mechanism, and angle; avoid repeating the same thesis. A subject may return with a genuinely different engineering mechanism.

After a complete, successful post generation, create one metadata-only record using the schema in `chatgpt/data/README.md`. Do not save the full post. Mark status `generated` until publication is confirmed. Preserve all prior records and avoid duplicate entries.

Only perform the GitHub write when the current ChatGPT Project Instructions and permissions explicitly authorize automatic metadata logging. Otherwise ask for approval and do not silently write. Report whether logging succeeded or was skipped. A failed log must not be described as saved.
