---
name: linkedin-post-orchestrator
description: Researches 4–5 currently trending software topics from the web, selects the topic with the strongest conversion and SEO potential, writes both a LinkedIn post and an X post in an experienced developer voice, then invokes the linkedin-post-assets skill to generate a Nano Banana-ready prompt and finalizes the saved package in `_post_suggestion/<slug>/`.
---

# Skill: linkedin-post-orchestrator

## Purpose

This skill produces one complete social content package about a currently trending software topic.
Each run must produce:

- one LinkedIn post
- one X post
- one Nano Banana-ready prompt for the visual asset

The workflow must reflect topics trending right now and should optimize for both audience conversion
and organic discovery.

Before final topic selection, this skill must read the repository root `log.txt` file and avoid
duplicate or near-duplicate post ideas.

`log.txt` should use this structure for new entries:

```text
YYYY-MM-DD | Post Title | Primary Keyword | Topic Angle
```

Use `node .agents/skills/linkedin-post-orchestrator/scripts/check_duplicates.js "<Candidate Title>"`
to sanity-check likely final titles before the selection is locked.

Read `assets/post-style-guide.md` before writing any post content.
Use `assets/output-template.md` as the working structure when compiling the draft package.

---

## Workflow

Execute the following steps in strict order. Do not skip steps.

The implementation also supports a machine-auditable multi-agent pipeline mode:

```bash
node .agents/skills/linkedin-post-orchestrator/scripts/generate_post.js --pipeline "<pipeline-input.json>"
```

In this mode, the system executes multi-agent research, selection, writing, review, and revision loops (max 3 iterations), then persists required trace artifacts:

- `research_brief.json`
- `selection_decision.json`
- `draft_package_v1.json`, `draft_package_v2.json`, `draft_package_v3.json`
- `review_decision_v1.json`, `review_decision_v2.json`, `review_decision_v3.json`
- `workflow_summary.json`

---

### Step 1 — Spawn the Researcher Subagent

**Scope:** Web research only. No writing. No selection.

**Instructions:**

Search the web for 4 to 5 currently trending software engineering topics.

Prioritize these source types:
- Major tech platform engineering blogs
- Developer communities
- OSS project activity and release discussions
- Dev-tool launches, pricing shifts, controversies, or adoption spikes
- Infrastructure incidents or postmortems generating real discussion
- AI tooling shifts affecting how developers build, debug, ship, or maintain software

For each topic, return:

```
Topic Title: <title>
Summary: <2–3 sentence description>
Why Trending Now: <what triggered attention right now>
Audience Resonance: <who cares and why>
LinkedIn Conversation Potential: <high / medium / low with one-line reason>
Primary SEO Keyword: <one main keyword phrase>
Secondary SEO Keywords: <3 to 5 related keyword phrases>
Suggested LinkedIn Hashtags: <5 to 7 relevant hashtags>
Suggested X Hashtags: <2 to 4 relevant hashtags>
```

Return all 4 to 5 topics before proceeding. Do not select yet.

---

### Step 2 — Spawn the Selector Subagent

**Scope:** Topic selection only. No writing.

**Instructions:**

Before selecting, read `log.txt` at the repository root if it exists.

For each serious candidate title, run the duplicate checker script against `log.txt`.

Use the log to reject:

- exact title duplicates
- candidate topics that would obviously lead to the same post angle as an earlier entry
- minor rewordings of previously used titles
- near-duplicate titles with strong keyword overlap even when the wording changes slightly

Then review the researcher output and select the single topic with the strongest combined:

- audience conversion potential
- practical relevance for software professionals
- SEO/search intent strength
- discussion potential on LinkedIn and X

High-value conversion means the post is likely to attract and engage:
- Software engineers
- Technical founders and CTOs
- Dev-tool users and evaluators
- Potential consulting clients or collaborators
- Technical educators and learners

Return:

```
Selected Topic: <title>
Why Selected: <2–3 sentences>
Duplication Check: <why this is distinct from previous logged posts>
Target Audience Fit: <who will care and why>
Engagement Rationale: <why this will earn comments, shares, profile visits, or follows>
SEO Rationale: <why this topic has strong keyword/discovery value>
Primary SEO Keyword: <selected keyword phrase>
Secondary SEO Keywords: <selected supporting phrases>
LinkedIn Hashtag Set: <final 5 to 7 hashtags>
X Hashtag Set: <final 2 to 4 hashtags>
Why the Others Were Not Selected: <one sentence per rejected topic>
```

Do not write the posts yet.

---

### Step 3 — Spawn the Post-Writer Subagent

**Scope:** Post writing only. No research. No asset generation.

**Instructions:**

Read `assets/post-style-guide.md` in full before writing.

Write both posts on the selected topic.

#### LinkedIn post requirements

- Length: 150 to 300 words
- Tone: reflective, witty, experienced, professionally literate, anti-hype, insight-driven
- Voice: sound like someone who has debugged real systems long enough to recognize both hype and usefulness
- Hook: strong first line
- Body: relatable pain, grounded observation, practical insight beneath the humor
- Formatting: short paragraphs of 1 to 3 lines
- SEO: include the primary SEO keyword in the first line or first paragraph
- SEO: naturally weave in 2 to 4 secondary keyword phrases
- Hashtags: end with 5 to 7 highly relevant SEO-optimized hashtags
- Ending: comment-worthy, but not a generic call to action

#### X post requirements

- Length: compact and platform-native, ideally one clean post
- Tone: witty, technically literate, sharp, concise, blunt, and pragmatically anti-hype
- Hook: strong first line or first sentence
- Structure: prefer 2 to 4 short lines with clean spacing
- Structure: lead with a plainspoken claim or contrast, not a polished slogan
- Structure: a compact mini-essay is allowed when the idea needs narrative setup
- Structure: include one concrete engineering pain detail when it strengthens the post
- Structure: use a memorable contrast line when it fits the topic
- Structure: end on a practical takeaway or punchline that feels earned
- SEO: include the primary SEO keyword in the first line or sentence
- Hashtags: end with 2 to 4 highly relevant SEO-optimized hashtags
- No filler, no keyword stuffing
- For AI topics: frame AI as reducing friction, debugging pain, or repetitive work rather than replacing good engineers
- For AI + open-source topics: acknowledge code reuse concerns, but distinguish copied output from the human systems that make software valuable

#### Both posts must avoid

- fake statistics
- thought-leader clichés
- corny motivational framing
- shallow provocation
- generic filler hashtags
- hashtags unrelated to the actual topic

Return the following only:

```
Post Title: <concise title derived from the selected topic>
LinkedIn Post:
<final LinkedIn post>

X Post:
<final X post>
```

---

### Step 4 — Use the linkedin-post-assets Skill

After both posts are written, use the `linkedin-post-assets` skill.

Pass it:
- the post title
- the selected topic
- the completed LinkedIn post
- the completed X post
- the chosen keyword theme and hashtags

The asset skill must return one production-ready Nano Banana prompt.
That prompt must include a short topic-based text overlay centered in the middle of the thumbnail.
Wait for it to complete before saving outputs.

---

### Step 5 — Finalize and Save the Full Package

After the LinkedIn post, X post, and Nano Banana prompt are all finished, finalize the package using:

```bash
node .agents/skills/linkedin-post-orchestrator/scripts/finalize_post_package.js "<Post Title>" "<path/to/linkedin-post.txt>" "<path/to/x-post.txt>" "<path/to/prompt.txt>" "<Primary Keyword>" "<Topic Angle>"
```

Or:

```bash
npm run finalize:post -- "<Post Title>" "<path/to/linkedin-post.txt>" "<path/to/x-post.txt>" "<path/to/prompt.txt>" "<Primary Keyword>" "<Topic Angle>"
```

This command must:

- create `_post_suggestion/<short-slug>/linkedin_post.txt`
- create `_post_suggestion/<short-slug>/x_post.txt`
- create `_post_suggestion/<short-slug>/prompt.txt`
- reject exact and near-duplicate titles against `log.txt`
- append the finalized structured record to `log.txt` only after the package is complete

---

## Final Output Format

Each completed run must produce exactly these files:

| File | Location |
|------|----------|
| LinkedIn post | `_post_suggestion/<short-slug>/linkedin_post.txt` |
| X post | `_post_suggestion/<short-slug>/x_post.txt` |
| Nano Banana prompt | `_post_suggestion/<short-slug>/prompt.txt` |

Print the saved paths when complete.

---

## Rules

- Do not skip the asset skill step.
- Do not save outputs outside `_post_suggestion/`.
- Do not save the posts as a combined markdown file.
- Derive the slug from the actual final post title.
- Keep the slug concise and readable.
- When the user prompt is `generate post`, execute the full workflow and finalize the saved package before stopping.
- Ensure the LinkedIn and X posts cover the same topic but are platform-optimized.
- Ensure hashtags are SEO-relevant, topic-specific, and non-spammy.
- Ensure the LinkedIn post reflects an experienced developer voice rather than generic influencer copy.
- Always perform the `log.txt` duplication check before final selection.
- Avoid near-duplicate framing even when the exact title is different.
