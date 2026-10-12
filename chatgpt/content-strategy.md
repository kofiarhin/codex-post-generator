# LinkedIn Content Strategy

## Goal
Position Kofi as a full-stack and AI engineer who builds reliable, useful software. Demonstrate engineering judgment through specific problems, mechanisms, decisions, trade-offs, and lessons rather than simply reporting AI news.

## Default Topic Selection
Start with current AI news, then find its strongest practical connection to Kofi's actual code. The final post may focus on a bug, architecture decision, implementation technique, or trade-off. News starts the research; verified engineering evidence supplies the substance.

Vary the engineering lessons across posts. Do not force a percentage mix or select a generic topic merely to fill a category.

## Practical-Solution Default
Prefer concrete bugs, debugging, root causes, fixes, tests, and implementation decisions over general AI commentary. A post should teach a usable technique, not merely state that reliability matters.

## Topic Diversity
Cover both full-stack and AI engineering: JavaScript/TypeScript, React, Node.js, Express, MongoDB, API design, authentication, testing, CI/CD, deployment, observability, security, RAG, agents, models, tooling, and production AI.

Do not repeatedly select agent permissions, approval gates, safety boundaries, or verification just because relevant project evidence exists. Those topics remain valid when there is a distinct, useful new insight.

## Evidence First
Prefer verified engineering experience and concrete examples. Use private IdeaHub, Linear, and GitHub context for topic selection only. Check the current repository to confirm implementation claims. A task or plan is not proof of implementation. Runtime claims require verified runtime evidence.

Never invent incidents, outcomes, customers, builds, deployments, benchmarks, numbers, or first-person experience. When evidence supports only a recommendation, say 'I would' or frame it as a proposed design.

## News-to-Code Workflow
1. Research several trending AI developments from the previous 24–72 hours, widening to seven days only when needed. Include models, SDKs, agents, developer tools, infrastructure, and techniques. Use news coverage to discover candidates; verify technical claims with official announcements, documentation, release notes, or research papers. Check event and publication dates. Do not call a story trending solely because it is recent; use visible coverage or activity, otherwise call it recent.
2. Read generated-post history before selection. Compare each candidate's likely problem, mechanism, angle, and thesis with previous entries.
3. Discover relevant repositories through the connected GitHub integration. Use targeted IdeaHub project records or Linear tasks when they help identify active work, then confirm against current GitHub evidence. Recent activity is a tie-breaker, not proof of relevance. Do not load the whole account or knowledge base.
4. Inspect a small shortlist of matching repositories. Read repository instructions, README, dependency manifests, and the actual files implementing the relevant behaviour. Read tests or pull requests only when needed to verify a claim. Use each project's current default branch unless the user names another branch; keep the editorial rules and history on main. Record the inspected commit/ref. README text, installed dependencies, issue plans, and test files alone do not establish running behaviour.
5. Build an internal evidence map for each strong candidate: verified news capability, repository and commit/ref, relevant code path and behaviour, concrete applicability, proposed change or decision, limitation, and overlap with history. Keep private names, paths, and links out of public output and metadata.
6. Automatically select the strongest supported connection. Prioritize direct code relevance, a useful engineering lesson, reliable evidence, and a fresh mechanism over headline popularity. Do not invent a connection or favour agent-safety topics by default. If no strong match exists, broaden within seven days and inspect another relevant project. If still unsupported, report the gap and offer a clearly labelled news-only alternative instead of pretending it reflects Kofi's work.
7. Draft around one concrete news-to-code relationship: what changed, where it applies to verified code, what decision it creates, how the mechanism works, and a meaningful trade-off. Avoid turning the post into a release summary or a project catalogue.
8. Fact-check every news, code, and outcome claim. Code inspection supports implementation claims; passing tests, merges, deployments, and performance require their own verified evidence. Describe unimplemented applications with 'could', 'I would', or 'a proposed change'. Never claim the news feature was adopted merely because it applies.
9. Review voice, repetition, technical substance, and safe disclosure. Generate the aligned thumbnail, then log metadata using the existing schema and permissions. Preserve existing history; do not store the internal evidence map.

## Disclosure and Access
Public repository details may be cited when safe and useful. For private repositories, use only a generalised engineering lesson; omit identifiers, architecture details, source code, links, customer information, and unreleased plans unless the user explicitly authorizes disclosure. If generalisation cannot protect those details, choose another connection.

If GitHub access fails, report it. Never claim code inspection or a news-to-code comparison was completed without retrieved evidence. Keep research and repository inspection read-only; the existing metadata-only logging authorization remains unchanged.

For 'generate 3 ideas', perform research, targeted code inspection, and history comparison, then return three distinct news-to-code ideas with their engineering angle, value, and suggested direction. Do not draft full posts, generate thumbnails, or log ideas.

## Repetition Check
Before selecting a topic, compare the latest available published posts by thesis, mechanism, opening, example, and conclusion. Avoid repeating the same argument with different words. If recent post history is unavailable, say so internally and avoid claiming a repetition check was completed.

## Learning from Performance
Use screenshots or verified analytics to compare impressions, reactions, comments, profile visits, and clicks when available. Compare posts at the same age, ideally 48 hours and 7 days. Do not conclude that one format wins from raw impressions measured at different ages.

The supplied October 2026 screenshots suggest that concrete agent verification and repository-conflict examples attracted more impressions than some general AI topics. This is a small, non-controlled snapshot, not a causal finding.

## Links and CTA
Include a verified relevant DevKofi article when available, otherwise a verified blog or homepage. Never invent URLs. Only include a newsletter link after its exact URL has been configured and verified. End with a specific engineering question when it naturally adds value; avoid engagement bait.

## Topic Learning Loop

Treat `chatgpt/data/post-history.json` as the generation history. Read it before topic selection. Compare the specific problem, mechanism, angle, and thesis, not only the title.

Prefer topics and technical mechanisms not recently covered. Do not permanently ban a broad topic: a new failure mode or solution can justify revisiting it. Use generated entries for diversity checks; only verified published entries count as published history.

After successful generation, record only metadata using the documented schema. Keep publication status separate. If history is unavailable, disclose that the comparison was incomplete. If logging fails, report that fact.

Learning means better topic coverage and use of verified performance evidence when available. Do not claim the generator learned from metrics it has not received.
