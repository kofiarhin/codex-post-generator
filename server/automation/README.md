# Autonomous Post Generator — disabled dry run

This is a draft-only foundation for IDE-120. It never calls Buffer or IdeaHub API.
The existing manual/thumbnail workflow is unchanged.

Use `node server/automation/run.js` only at 06:00 or 18:00 Europe/London.
For Beast cron, set `CRON_TZ=Europe/London` and schedule `0 6,18 * * *`;
do **not** install or activate the cron until separate deployment approval.

Requires authenticated Codex CLI and private `MONGODB_URI`. Data is stored
in `automatedpostdrafts` in the existing MongoDB database. The collection has
unique run and exact topic hashes. No credentials belong in source control.

Before production: implement validated, scoped service credentials and a
dedicated authorized IdeaHub API publishing route, verify all source claims,
make duplicate/partial publishing recovery safe, and run end-to-end tests.
The current existing API human approval gate must not be bypassed.

**Known limitation:** HTTPS source references alone do not prove claim accuracy.
This prototype saves drafts only and must not be treated as publish-ready.
