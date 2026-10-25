# Post Generator automation (IDE-122)

Implements the [merged Post Generator specification](https://github.com/kofiarhin/ideahub/blob/cbdd707935bc4408bb4ff8e15cfd6973c4ce260f/projects/post-generator.md)
and [IDE-122](https://linear.app/ideahub-devkofi/issue/IDE-122).
The Node orchestrator owns Codex research (with Claude Code fallback on Codex rate limits), validation, Mongoose persistence, and direct Buffer publishing.

Failure diagnostics distinguish `generation`, `draft-validation`, `review`, and `review-validation`.
They include allowlisted codes such as `CODEX_TIMEOUT`, `CODEX_RESEARCH_MISSING`,
`LINKEDIN_MARKDOWN`, and `DUPLICATE_CONTENT`, without printing generated content, stderr,
exception messages, or credentials. A failed Claude fallback retains its own code and
`CODEX_RATE_LIMITED` context. Failures still stop without automatic retries or publishing.
Manual dry runs and live runs generate separate drafts; dry-run drafts remain in duplicate history.
Before these diagnostics were added, `generation-validation (Error)` did not identify the
underlying cause, and discarded generation output cannot be reconstructed from that message.
The manual four-file/thumbnail workflow stays separate. This path creates text-only MongoDB drafts;
it does not generate thumbnails, append to the manual `log.txt`, or call IdeaHub API.
IdeaHub's approval-gated publishing is unchanged.

**Publishing is disabled by default. No scheduler is installed or activated.**
Deployment and unattended publishing each require separate approval. A passing test suite is not approval.

## Configuration and entry points

Use Node.js 18+ (`fetch`, `AbortSignal.timeout`), `npm ci`, and an authenticated Codex CLI.
The CLI contract was inspected with Codex 0.155.1. It must support `exec --ignore-user-config`,
`--ephemeral`, `--output-schema`, JSONL web-search events, and the isolation settings in `codex.js`.
There is no API-key fallback for Codex: authenticate its dedicated runtime account before deployment.

Private `.env` keys (do not print their values):

| Key | Purpose |
| --- | --- |
| `MONGO_URI` | Existing MongoDB database; required even in draft-only mode |
| `MONGODB_URI` | Legacy fallback only; if both are set they must match exactly |
| `BUFFER_API_KEY` | Buffer personal API key; needed only for publishing or read-only reconciliation |
| `BUFFER_LINKEDIN_CHANNEL_ID` | Explicit LinkedIn allowlist entry |
| `BUFFER_X_CHANNEL_ID` | Explicit, different X allowlist entry |
| `AUTONOMOUS_PUBLISH_ENABLED` | Defaults to disabled; only the exact string `true` enables the environment gate |

`.env.example` contains placeholders. An earlier committed version contained a MongoDB credential:
rotate/revoke that credential with the database owner before any live verification or activation.
Removing it from the current file does not remove it from Git history. Do not copy the old value
into tickets, logs, test fixtures, or documentation. This implementation does not rewrite history.

```bash
npm test                         # local disposable MongoDB; mocked Codex and Buffer
npm run test:automation           # automation regression suite only
npm run automation:dry-run        # manual, any time; real Codex + MongoDB, ZERO Buffer calls
npm run automation:publish-manual # manual, any time; one fresh LinkedIn/X pair through Buffer
npm run automation:run            # scheduled slots only; LinkedIn-only; draft-only unless passed --publish
```

The three automation commands are operational runs, not test fixtures. They persist real drafts; only the
scheduled command reserves a scheduled slot. Use the configured database only with authorization.
The CLI loads `.env` only at entry,
not when imported by tests. Dry runs never construct a Buffer client, including with activation enabled.
Publishing requires **both** explicit `--publish` and the enabled environment gate. Do not use either
activation action until separately approved. Dry-run and legacy drafts can never be promoted implicitly.

`automation:dry-run` passes `--dry-run --manual`; `automation:publish-manual` passes `--publish --manual`.
Both manual modes work at any hour and
use `post-generator:manual:YYYY-MM-DD:<UUID>` with the London calendar date and `slot: manual`.
Each invocation gets a fresh UUID, even within the same millisecond, so it cannot reuse or reserve a
scheduled morning/evening key. Manual publishing generates and reviews one LinkedIn post and one X
post, persists both, then submits each through Buffer. There is no fixed daily run limit or publishing
time window, including if generation crosses midnight. The existing `AUTONOMOUS_PUBLISH_ENABLED=true`
gate, credentials, channel allowlists, validation, lock, and Buffer cooldown still apply. Unlimited
manual runs do not bypass provider quotas or guarantee delivery when a safety check fails.
`--manual` alone and conflicting `--dry-run --publish` flags are rejected before database access.
Dry-run mode remains non-publishing even with the environment gate enabled. Both channel states remain `not_published`
with zero attempts; the dry-run returns before Buffer construction, preflight, reconciliation, or send.

Manual runs use the same Codex generation, independent source review, validation, duplicate history,
unique topic index, and global lock as scheduled runs. A manual topic therefore remains part of future
duplicate checks. Concurrent runs still fail closed on the shared lock; manual identifiers separate
slot ownership, not the locking or originality protections. There is no automatic retry. Successful
CLI output includes the shared post title and run key for inspection.
Every manual invocation starts a new topic; it never resumes or retries an earlier manual submission.
Uncertain or accepted results must be inspected/reconciled using the original run key. Failed and
pending drafts remain in duplicate history. The automatic 06:00/18:00 schedule is unchanged.

### LinkedIn-only manual publishing

To generate, validate, store, and submit exactly one LinkedIn post with no X requests:

```bash
npm run automation:publish-manual -- --platform=linkedin
```

For manual runs, `--platform=linkedin` is opt-in and also supports a draft-only run:

```bash
npm run automation:dry-run -- --platform=linkedin
```

These are operational commands using real Codex research and the configured MongoDB. Publishing
still requires `AUTONOMOUS_PUBLISH_ENABLED=true`, the Buffer API key, and the LinkedIn channel ID.
The X channel ID and subscription are not used. Unknown and conflicting platform selections fail
before database access. For **manual** runs, omitting the option preserves the two-platform mode.
**Scheduled runs are always LinkedIn-only** (see below); there is no scheduled X mode.

LinkedIn-only generation returns no `xPost`. The same source, quality, originality, length, hashtag,
and duplicate checks apply to the LinkedIn post, using shared history from both modes. MongoDB stores
`platform: linkedin`, the LinkedIn text, validation evidence, and only a LinkedIn publication record.
The platform selection is bound to the validation hash. The selected Buffer client rejects X before
HTTP, even if an X channel ID is provided; no X preflight, publication, or reconciliation occurs.
Global locks, authentication gates, rate limits, durable claims, and no-retry handling are unchanged.
There is no automatic retry of uncertain sends. Each fresh command run requires an original topic.

Inspection and LinkedIn read-only reconciliation use the returned manual run key with
`automation:recover`; they do not require X credentials. Summary status covers LinkedIn only.
Existing two-platform documents remain compatible without migration, and rejected/dry-run records
are not promoted or reset by this option.

For an isolated safe dry run with mocked Codex output, disposable local MongoDB, and zero Buffer access:

```bash
node --test --test-name-pattern="LinkedIn-only safe dry run" server/automation/linkedinOnly.test.js
```

## Scheduling contract (not installed)

Scheduled runs (`automation:run`, with or without `--publish`) are **always LinkedIn-only**. They
generate, review, store and submit one LinkedIn post per slot. X is never generated, stored,
preflighted, published or reconciled for a slot, even when `BUFFER_X_CHANNEL_ID` is set; the X
channel ID is not required. `--platform=linkedin` is accepted but redundant; any other scheduled
platform selection fails before database access. Defence in depth: the model rejects new scheduled
drafts without `platform: linkedin`, and the publisher refuses to resume any existing two-platform
slot draft (it never reaches Buffer), so legacy or externally written rows cannot reach X.

The intended schedule is 06:00 and 18:00 **Europe/London**, using a DST-aware scheduler on Beast.
For a cron implementation that supports `CRON_TZ`, the schedule expression is `0 6,18 * * *` with
`CRON_TZ=Europe/London`. Verify that support before installation; setting a child process's `TZ`
is not sufficient to change how every cron daemon schedules jobs. Do not use Beast's Linear ticket runner.

`slotAt()` maps UK local date/hour to `post-generator:YYYY-MM-DD:morning|evening`. The 06:00–06:59
and 18:00–18:59 windows allow startup delays and safe same-slot retries. Each slot can create at most
one draft and one accepted LinkedIn submission. Initial scheduled runs outside these windows fail before DB
connection. The clock is checked again immediately before each submission; delayed research cannot
publish outside its slot. There is no catch-up publishing or retry worker. Old slots can only be inspected
or reconciled, so they cannot add extra posts to a later day.

## AI engine fallback (Codex → Claude Code)

Codex CLI is the default engine. Every new post (each `run`) starts a fresh engine session and tries
Codex first. Only a **recognized Codex usage/rate limit** switches that post to the Claude Code CLI
(`claude -p`); the switch covers the remaining stages of the same post (generation and/or review).
The next post tries Codex again. Any other Codex failure (timeout, bad output, missing web search,
unexpected tool use) stops the run without fallback.

- Detection (`codex.js`): a non-zero exit, or a `turn.failed` event, whose `error`/`turn.failed`
  event text or stderr matches usage limit, rate limit, `429`, or Too Many Requests. Transient
  reconnect errors before a successful turn and generated content never trigger a switch.
- Same contract (`engines.js`): both engines receive the identical prompt and JSON schema built by
  `generationRequest`/`reviewRequest`. Fallback output goes through the same `validateDraft`,
  independent review, duplicate history, unique `topicHash` index and lock. Fallback never relaxes checks.
- Claude isolation (`claude.js`): `--restricted --strict-mcp-config --setting-sources ""
  --disable-slash-commands --no-session-persistence --permission-mode dontAsk`, tools limited to
  `WebSearch,WebFetch`, `--json-schema` structured output, `stream-json` events. It requires a
  completed `WebSearch` or `WebFetch`, rejects any other tool, and fails closed on errors. Its child environment
  is `PATH`, `HOME`, `CLAUDE_CONFIG_DIR`, `TMPDIR`, `LANG` only (no DB, Buffer or Anthropic API keys); it
  uses the CLI's own login under the runtime user's home. Raw output is never logged.
- Both engines failing: the run throws `Codex is rate limited and the Claude fallback failed`, saves
  nothing, publishes nothing, and releases the lock. There is no retry.
- Recorded in MongoDB on each new draft: `generation: { engine, reviewEngine, codexRateLimited }`
  (`engine`/`reviewEngine` are `codex` or `claude`). Older drafts have no `generation` field.

Engine choice does not affect publishing: LinkedIn-only runs submit only to LinkedIn and never send
X requests. Before relying on fallback live, confirm `claude -p` is logged in for the runtime user.

## Generation and validation

1. Acquire the durable, global generation/publishing lock.
2. Read `automatedpostdrafts` history plus the existing manual title/angle log.
3. Ask Codex to research 4–5 candidates using live search, select a distinct topic, and return one
   LinkedIn post and one X Premium post with primary/secondary keywords and at least two distinct
   public HTTPS sources, specific claims, and supporting excerpts.
4. Validate lengths, hashtags, paragraph formatting, keywords, source shape, near-duplicate titles
   and angles, and exact duplicate text. LinkedIn uses Buffer's UTF-16/24-unit URL counting;
   X uses a conservative 1,500 UTF-16-unit editorial cap (target 400–900).
5. A separate Codex invocation opens the sources and checks all claims, quality, currency, and
   semantic originality against history. Any failed/missing check blocks saving and publishing.
6. Save both validated posts, evidence, content hash, slot key, channel mapping, local idempotency
   keys, and per-channel states **before any Buffer request**.

The child receives an allowlisted environment, never application DB/Buffer credentials. User config,
project instructions, command tools, apps, browser control, and multi-agent tools are disabled for
this invocation. It runs read-only with no configured MCP servers, has a three-minute timeout per
stage, requires JSON schema output and a completed web-search event, and removes its private scratch
directory under `_post_suggestion/` on exit. Raw CLI output is never logged. Use a dedicated Codex
runtime home without unrelated plugins or managed hooks; machine-managed configuration still needs
review before deployment. Source/semantic review is model-assisted, not a mathematical guarantee of
truth or originality. A successful web-search event alone is not proof of every claim.

## MongoDB compatibility and durability

`AutomatedPostDraft` explicitly uses the existing `automatedpostdrafts` collection. New records have
`schemaVersion: 2`, validation version 2, and per-channel publication receipts. Old records remain
readable and participate in duplicate history but cannot publish. Index creation is additive: unique
`key` and `topicHash` indexes are retained; there is no `syncIndexes`, data deletion, or bulk migration.
Index errors stop the run. `MONGO_URI` is canonical for the dashboard/manual persistence helper as well;
the old alias remains supported. A different already-open MongoDB destination is rejected.

The `postgeneratorlocks` collection lives in the **same database**. A single non-expiring lock protects
generation plus publication across processes and slots. It deliberately has no TTL: an expired lease
could permit a second worker to submit while the first still runs. Per-channel compare-and-set claims
persist `publishing` and increment attempts before sending. A second lock-collection record stores the
global Buffer retry time, which survives restarts and applies to both channels and subsequent slots.

The stored `status: validated` describes content validation; **per-channel states are authoritative
for delivery**. A returned Buffer ID is not automatically proof of publication.

| Channel state | Meaning / next action |
| --- | --- |
| `not_published` | Dry-run draft, never eligible for promotion |
| `pending` | Saved live-intent draft with no send attempt yet |
| `publishing` | Durable claim; if interrupted, treat as uncertain |
| `accepted` | Buffer has an ID and reports `sending` or `scheduled`; reconcile, never resubmit |
| `published` | Buffer reports `sent`; terminal |
| `rejected` | Known request/delivery/preflight failure; no automatic retry |
| `rate_limited` | HTTP 429; respect durable `Retry-After`, maximum three mutation attempts per channel |
| `unknown` | Timeout, 5xx, malformed/partial GraphQL response, or interrupted claim; reconcile only |

Only `pending` and due `rate_limited` records can be claimed. A 429 stops further requests with that
API key; missing/invalid retry headers use a conservative 30-day cooldown. Preflight failures are
saved before returning. A database failure after a Buffer send leaves the durable claim in place:
never clear it to retry. Successful channels survive another channel's failure. Already completed
runs make no Buffer calls. CLI exit codes: `0` for draft-only success or accepted/published submissions,
`2` for persisted states needing attention, `1` for thrown configuration/research/storage/recovery
errors. `complete` means both channels report published (or the requested dry run is complete).

Channel preflight failures are recorded independently. A disconnected, locked, paused channel, missing
channel publishing permission, or unverified X subscription blocks that channel only; LinkedIn can still
publish when X reports `subscriptionType: "None"`. The paid-subscription allowlist is unchanged.
All eligible channels are checked before any submission. Authentication/request errors, uncertain API
responses, and rate limits still stop the whole run; the shared Buffer cooldown remains enforced.
Rejected records are not automatically retried or reset, including records saved before this change.

## Inspection and recovery (no publication)

Inspection works outside slot hours and needs only MongoDB:

```bash
npm run automation:recover -- post-generator:YYYY-MM-DD:morning
```

Manual keys returned by either manual command can also be inspected with `automation:recover`.
Manual publishing results support the same read-only reconciliation using their full run key.
Dry-run drafts can only be inspected; reconciliation rejects them before Buffer access.

If a run stopped with a global lock present, **first verify the worker and any Codex subprocesses have
terminated on every runtime host**. Inspect `_id: generation-and-publishing`, its owner, and acquiredAt
in `postgeneratorlocks`. Only an operator may delete that exact lock using both `_id` and the observed
owner as the filter. Never drop the collection, clear publication claims, delete a draft, or reset
attempt counters. An active lock blocks reconciliation writes as well as new runs; inspection remains
available. Lock release by the normal process is always owner-scoped.

For an uncertain result, find the candidate post in Buffer manually. Reconcile it with:

```bash
npm run automation:recover -- post-generator:YYYY-MM-DD:morning x BUFFER_POST_ID
```

This constructs a publishing-disabled Buffer client and issues only `post` queries. It verifies the
allowlisted channel, exact text, ID, and persisted content validation before storing the observed status.
If an ID is already stored, another ID is rejected. If the post cannot be identified or its text changed,
leave the result unknown; absence of a response is not evidence that resubmission is safe.
Accepted posts can be reconciled the same way. No ID search, replay, force-publish, unlock, or state-reset
command is provided. A read error preserves the original receipt; a read 429 also sets global cooldown.
Within the original slot, rerunning the authorized publisher retries only pending/due rate-limited
channels. Outside that slot it cannot replay them. Fix rejected-channel configuration for future slots.

## Verified Buffer contract

Checked against the official documentation on 2026-10-21:

- [API reference](https://developers.buffer.com/reference.html): `POST https://api.buffer.com`, bearer
  token, `createPost(CreatePostInput!)`, `schedulingType: automatic`, `mode: shareNow`, empty assets,
  `saveToDraft: false`, `needsApproval: false`, `aiAssisted: true`. Both success and mutation-error
  fragments are requested. No undocumented idempotency header is sent; idempotency is enforced locally.
- [Channel fields](https://developers.buffer.com/reference.html): exact IDs/services, `scheduleUpdates`,
  connected/unlocked/unpaused status; X subscription metadata must indicate Basic/Premium/Premium+.
  Unrecognized subscription values fail closed. Actual account permissions still need verification.
- [Character limits](https://developers.buffer.com/guides/character-limits.md): LinkedIn 3,000 units
  with URL adjustment; Buffer documents 25,000 weighted characters for paid X tiers. Our editorial
  limit is deliberately lower. This workflow never splits text into a thread.
- [Errors](https://developers.buffer.com/guides/error-handling.md) and
  [rate limits](https://developers.buffer.com/guides/api-limits): HTTP and GraphQL errors are handled
  separately, raw provider messages are discarded, and ambiguous mutation responses are never retried.
- [Codex non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode) and
  [configuration](https://learn.chatgpt.com/docs/config-file/config-reference) underpin the CLI contract.

## Verification and remaining release gates

Engine fallback verification on 2026-10-23: `server/automation/engineFallback.test.js` covers Codex
success, automatic Claude fallback on a Codex usage limit (identical prompt/schema, engine recorded,
LinkedIn-only publish with zero X requests), Codex retried first on the next post, both engines
failing (nothing saved, lock released, no Buffer access), no fallback on non-rate-limit Codex errors,
duplicate rejection of fallback drafts, rate-limit detection edge cases, and Claude adapter isolation.
Codex, Claude and Buffer were mocked; MongoDB was disposable and local. No live post was generated or published.

Manual publishing verification on 2026-10-22: `npm test` passed all **84 tests** (7 assets,
13 server, 64 automation), with zero failures or skips. Coverage includes repeated off-schedule
manual runs, midnight crossing, unchanged scheduled restrictions, duplicate protection, publishing
gates, shared locks/cooldowns, durable uncertain outcomes, and read-only manual reconciliation.
Buffer HTTP and Codex execution were mocked; MongoDB was disposable and local. No live publishing
command was run, and no environment configuration or scheduler was activated.

Local verification on 2026-10-21: `npm test` passed all **66 tests** (7 assets, 13 server,
46 automation), with zero failures or skips. `git diff --check` and `npm ls --depth=0` also
passed. The inherited automation test syntax error was corrected. The end-to-end dry-run test
saved both posts, evidence and validation to disposable MongoDB with zero Buffer calls; the
Codex adapter and Buffer contract tests used mocked transports. No live publication was attempted.

Automated tests use `mongodb-memory-server` on loopback and real Mongoose writes/indexes. The first
run may download its MongoDB binary; CI can pre-cache it or set `MONGOMS_SYSTEM_BINARY`. Do not point
tests at production. Codex and Buffer transports are mocked; no test loads `.env`, calls a live model,
or submits a real post. Coverage includes DST boundaries, duplicate/originality rejection, source and
format validation, secrets isolation, missing config, unique/atomic claims, overlap locks, legacy rows,
content tampering, partial delivery, DB failure after a send, rate limits/retry caps, and recovery.

Before a separately approved deployment, verify the Beast workspace registration, checkout path and
origin, dedicated Codex authentication/configuration, scheduler timezone support, rotated private
credentials, real collection/index compatibility, MongoDB connectivity, and authorized Buffer channel
permissions. These live checks are not established by mocks. Review the branch and obtain approval
before commit/push/PR; deployment and activation remain separate approvals.
