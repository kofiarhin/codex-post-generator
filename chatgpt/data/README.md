# Generated Post Metadata

`post-history.json` stores metadata only, not full post text or thumbnails.

Each entry uses:
- `id`: unique stable ID
- `generated_at`: ISO-8601 UTC timestamp
- `topic`: short topic name
- `category`: real-problem | architecture | ai-news
- `angle`: specific engineering perspective
- `problem`: problem the post addresses
- `mechanism`: core technical explanation
- `status`: generated | approved | published
- `source_refs`: public source URLs, when appropriate (never private links)

Do not store personal details, secrets, private repository paths, internal project names, full post bodies, thumbnails, or unverified performance metrics.

Read history before selecting a topic. Avoid repeating the same mechanism or thesis even with different titles. Revisit a broad subject when the engineering problem is genuinely different.

After a successful generation, append one metadata record, preserving existing records. Check for an existing matching ID to avoid duplicate writes. If saving fails, report it; do not claim the record was stored.

GitHub writes require authorization from the active ChatGPT Project Instructions and applicable permissions. If automatic logging is not authorized, request approval before each write or leave it pending. Never bypass permission rules.

Do not automatically mark entries published; publication status requires verified confirmation.
