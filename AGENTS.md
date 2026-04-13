# X Premium Override

- Default workflow assumption: the X account for this repository supports long-form premium posts unless a user explicitly asks for short-form only.
- This overrides older X brevity guidance wherever they conflict.
- For `x_post.txt`, prefer a more developed single-post format with more substance, not just a short punchline.
- Default target length: roughly 400 to 900 characters.
- Allowed extended range when the topic genuinely benefits: up to 1,500 characters.
- Keep it platform-native: strong first line, clean short paragraphs or line breaks, one coherent argument, no filler, no thread numbering unless explicitly requested.
- Longer length must earn its space with sharper insight, concrete engineering pain, useful nuance, or a stronger takeaway.
- Keep the tone blunt, literate, and anti-hype; do not let extra length turn the post into corporate copy.
- Preserve the existing hashtag rule of 2 to 4 highly relevant hashtags.
- If a topic is clearly stronger as a shorter post, shorter is still allowed, but the default should no longer optimize for free-account character limits.

 # AGENTS.md — LinkedIn Content Workflow Rules

This file defines repo-wide rules for all Codex agents operating in this repository.
All agents must read and follow these rules before taking any action.

---

## Repository Purpose

This repository is a Codex-powered social content workflow.
It produces LinkedIn and X posts about trending software topics,
paired with Nano Banana-optimized visual prompts for thumbnails and social graphics.

---

## Output Directory

| Output Type           | Directory           |
|-----------------------|---------------------|
| Final workflow output | `_post_suggestion/` |

- The directory exists at the repository root.
- Do not save outputs anywhere else.
- Save each run inside its own short slug-named subdirectory.
- Final structure must be `_post_suggestion/<short-slug>/linkedin_post.txt`, `_post_suggestion/<short-slug>/x_post.txt`, and `_post_suggestion/<short-slug>/prompt.txt`.

---

## Filename Rules

- The output folder name must be a short slug derived from the final post title.
- Slugify rules:
  - Lowercase all characters
  - Replace spaces and special characters with hyphens
  - Strip leading/trailing hyphens
  - Collapse consecutive hyphens to one
- Keep the slug concise and readable rather than using the full title when it becomes too long.
- Output folder: `_post_suggestion/<short-slug>/`
- LinkedIn post file: `_post_suggestion/<short-slug>/linkedin_post.txt`
- X post file: `_post_suggestion/<short-slug>/x_post.txt`
- Prompt file: `_post_suggestion/<short-slug>/prompt.txt`

---

## Duplication Prevention Rules

- Maintain a root-level file named `log.txt`.
- `log.txt` is the canonical history of previously written post titles.
- Save one finalized post record per line in `log.txt`.
- Preferred `log.txt` format:

```text
YYYY-MM-DD | Post Title | Primary Keyword | Topic Angle
```

- Legacy single-line title entries may still exist, but all new saves should use the structured format.
- Before selecting a final topic, read `log.txt` and compare the candidate topics and likely post angles against prior titles.
- Use `node .agents/skills/linkedin-post-orchestrator/scripts/check_duplicates.js "<Candidate Title>"` or `npm run check:duplicates -- "<Candidate Title>"` when validating a likely final title.
- Do not select a topic if it would clearly duplicate an earlier post title or a very similar post angle.
- If a topic is still worth covering but overlaps with a previous post, the new version must be meaningfully differentiated in angle, framing, and title.
- If all researched topics overlap too heavily with prior posts, prefer the topic with the freshest angle and explicitly explain the differentiation.
- The workflow must update `log.txt` after successfully saving a new post package.
- The final save step must also reject exact and near-duplicate titles based on `log.txt`.

---

## Research Rules

When researching trending software topics:

- Research 4 to 5 currently trending software issues from the web.
- Prioritize sources: major tech platforms, engineering blogs, developer communities,
  OSS project discussions, dev-tool launches, infrastructure incidents, AI tooling shifts.
- For each candidate topic return:
  - Topic title
  - Short summary (2–3 sentences)
  - Why it is trending right now
  - Likely audience resonance
  - LinkedIn conversation potential
  - Primary SEO keyword phrase
  - 3 to 5 secondary keyword phrases
  - Suggested LinkedIn hashtags
  - Suggested X hashtags

---

## Tone Profile Rules

- Write in a reflective, experienced developer voice that feels lived-in, observant, and credible.
- Default tone: sharp, grounded, slightly witty, professionally literate, anti-hype but not cynical.
- Prefer practical insight over performative hot takes.
- Humor should come from real engineering pain: debugging fatigue, tooling friction, shipping pressure,
  broken abstractions, AI overpromises, and the absurdity of software work.
- The voice should sound like someone who has built and debugged real systems long enough to distrust
  hype cycles, while still recognizing when a tool is genuinely useful.
- First-person framing is allowed and encouraged when it improves authenticity and resonance.
- Posts should feel thoughtful and human, not like generic social media copy.
- Avoid exaggerated certainty, empty provocation, and shallow “AI will replace developers” framing.
- Avoid listicle energy unless the format genuinely improves the post.

---

## Topic Selection Rules

- Select the single topic with the strongest high-value conversion potential.
- Before making the final selection, read `log.txt` at the repository root and rule out duplicate or near-duplicate post ideas.
- High-value conversion means likely to attract:
  - Software engineers
  - Technical founders
  - Dev-tool users
  - Potential clients or collaborators
  - Consultants
  - Technical educators and learners
- Also weigh search and discovery potential, not just trendiness.
- Favor topics that combine:
  - strong current relevance
  - high audience pain or curiosity
  - practical professional relevance
  - clear keyword/search intent
  - strong discussion potential on LinkedIn and X
- Return a clear rationale for the selection and an explanation of why the others were not chosen,
  including why they were weaker for SEO or discovery.
- Include duplication reasoning where relevant.

---

## Post Writing Rules

- Write exactly two social posts per run: one for LinkedIn and one for X.
- The two posts must cover the same selected topic but be optimized for their platform.
- Both posts must share the same primary keyword theme, adapted naturally to the platform.
- LinkedIn post length: 150 to 300 words.
- LinkedIn tone: reflective, witty, insight-driven, professionally literate, grounded in real developer experience.
- LinkedIn structure:
  - Strong hook in the first line
  - Relatable developer pain or insight
  - Practical observation beneath the humor
  - Short paragraphs (1–3 lines each)
  - Comment-worthy ending
- LinkedIn SEO requirements:
  - Include the primary SEO keyword in the first line or first paragraph
  - Naturally include 2 to 4 secondary keywords
  - End with 5 to 7 highly relevant SEO-optimized hashtags
- X post length: concise and platform-native, ideally a single strong post.
- X tone: witty, compact, technically literate, scroll-stopping, blunt, and pragmatically anti-hype.
- X structure:
  - Strong first line
  - Prefer 2 to 4 short lines with clean readability
  - Lead with a plainspoken claim or contrast, not a polished brand slogan
  - A short mini-essay format is allowed when the topic needs a little narrative setup
  - Ground the point in a concrete engineering pain detail when possible
  - Fast insight or punchline
  - Use a memorable contrast line when it fits: code vs community, shipping vs suffering, hype vs reality
  - Land on a practical takeaway that feels earned
  - Clean readability in short lines
  - No filler phrasing
- X SEO requirements:
  - Include the primary SEO keyword in the first line or first sentence
  - Use secondary keywords only if they fit naturally
  - End with 2 to 4 highly relevant SEO-optimized hashtags
- Hashtag rules:
  - Hashtags are required for both LinkedIn and X
  - Prefer searchable, topic-specific, high-intent hashtags over generic reach-bait
  - Mix broad and niche hashtags when appropriate
  - Avoid duplicate, redundant, or vague hashtags
  - Do not use hashtags unrelated to the actual topic
- Forbidden:
  - Fake stats
  - Cliché thought-leader phrases
  - Corny motivational framing
  - AI replacement theater or sci-fi framing when the real value is reduced friction
  - Keyword stuffing
  - Generic filler hashtags

### X Tone Reference

- Favor the feel of short, lived-in posts like: a blunt opening, one painfully specific engineering detail, then a practical line that explains why the tool matters.
- Example tonal shape: "AI won't replace good engineers. But it will save you from losing six hours to a bug caused by one disrespectful comma. That's the useful part: less suffering, more shipping."
- For AI topics specifically, frame AI as leverage that reduces debugging pain, context-switching, and repetitive work, not as a substitute for good engineering judgment.
- A second valid X mode is the compact contrarian mini-essay: open with a provocative thesis, build tension with one or two crisp observations, then land on a human truth the hype misses.
- When relevant, contrast what AI can copy with what it cannot reproduce: judgment, trust, community, maintenance, taste, and responsibility.

---

## Prompt Writing Rules

- The `prompt.txt` output must be optimized for Nano Banana image generation.
- Write one production-ready prompt, not a brainstorm list.
- Start with the core scene in the first sentence.
- Be explicit about subject, setting, composition, lighting, mood, color palette, and rendering style.
- Keep the tone aligned with LinkedIn: professional, witty, credible, and visually clean.
- Prefer realistic editorial or premium commercial illustration styles over meme or cartoon styles.
- Include clear constraints such as no logos, no watermarks, no clutter, no distorted hands, and no unreadable interface text.
- The final prompt must include a short text overlay section after the main prompt, not inside the main generation prompt.
- The text overlay must be based on the selected topic or final post title.
- The text overlay must be centered in the middle of the thumbnail.
- Avoid vague phrases like "make it cool" or "futuristic vibe" when a specific visual description can be used instead.
- Optimize for a high-quality social thumbnail or LinkedIn graphic with a strong focal point and simple composition.

---

## Workflow Sequence Rules

Agents must execute in this order:

1. Researcher subagent — research trending topics
2. Duplication check — read `log.txt` and rule out duplicate or near-duplicate topics
3. Selector subagent — choose the highest-conversion topic
4. Post-writer subagent — write both the LinkedIn post and the X post
5. Asset skill invocation — use the `linkedin-post-assets` skill after the posts are written
6. Save outputs — save all files inside `_post_suggestion/<short-slug>/`
7. Update title log — append the finalized post title to `log.txt`

The asset skill must always be used after the post is written. It is not optional.
All outputs must be saved as `linkedin_post.txt`, `x_post.txt`, and `prompt.txt` before the workflow is considered complete.
The saved `prompt.txt` must be a Nano Banana-optimized generation prompt.
The saved `prompt.txt` must include a topic-based text overlay centered in the middle of the thumbnail.
The finalized post title must also be written to `log.txt`.
The preferred final persistence step is `node .agents/skills/linkedin-post-orchestrator/scripts/finalize_post_package.js ...` or `npm run finalize:post -- ...` so that all three files are saved first and `log.txt` is updated only after the package is complete.

### Trigger Phrase

- If the user says `generate post`, treat it as a request to execute the full end-to-end workflow above.
- That means the agent must use `linkedin-post-orchestrator`, then `linkedin-post-assets`, then persist the finished package with `finalize_post_package.js`, and only then update `log.txt`.
- Do not stop after drafting copy. The workflow is only complete when the three required files exist under `_post_suggestion/<short-slug>/` and the title has been appended to `log.txt`.

---

## Skills Available

| Skill Name                    | Purpose                                           |
|-------------------------------|---------------------------------------------------|
| `linkedin-post-orchestrator`  | Research, select, write LinkedIn posts            |
| `linkedin-post-assets`        | Generate visual asset prompts for the post        |

---

## Save Script Usage

Use the Node.js save scripts only if they support the required final layout. The required saved structure is:

```bash
_post_suggestion/<short-slug>/linkedin_post.txt
_post_suggestion/<short-slug>/x_post.txt
_post_suggestion/<short-slug>/prompt.txt
```

If the scripts do not support that layout, update the workflow so the final persisted output still matches the required structure exactly.

Preferred finalization command:

```bash
node .agents/skills/linkedin-post-orchestrator/scripts/finalize_post_package.js "<Post Title>" "<path/to/linkedin-post.txt>" "<path/to/x-post.txt>" "<path/to/prompt.txt>" "<Primary Keyword>" "<Topic Angle>"
```

Or use the npm script:

```bash
npm run finalize:post -- "<Post Title>" "<path/to/linkedin-post.txt>" "<path/to/x-post.txt>" "<path/to/prompt.txt>" "<Primary Keyword>" "<Topic Angle>"
```

Legacy examples:

```bash
node .agents/skills/linkedin-post-orchestrator/scripts/save_post.js "<Post Title>" "<path/to/linkedin-post.txt>" "<path/to/x-post.txt>" "<Primary Keyword>" "<Topic Angle>"
node .agents/skills/linkedin-post-assets/scripts/save_asset.js "<Post Title>" "<path/to/prompt.txt>"
```

Or use the npm scripts defined in `package.json`:

```bash
npm run save:post -- "<Post Title>" "<path/to/linkedin-post.txt>" "<path/to/x-post.txt>" "<Primary Keyword>" "<Topic Angle>"
npm run save:asset -- "<Post Title>" "<path/to/prompt.txt>"
```

Note: `save:post` and `save:asset` are low-level helpers. For the normal end-to-end workflow, prefer `finalize:post` so `log.txt` is updated only after the package is complete.

---

## General Agent Rules

- Use any tool already allowed by the active Codex environment to complete the workflow end-to-end.
- Do not pause to ask for permission for normal workflow actions when the environment already allows them.
- Normal workflow actions include reading repo files, researching topics, writing outputs, invoking skills, and running the provided save scripts.
- If the environment is configured as non-interactive or already grants the needed access, proceed without additional confirmation.
- If a tool is blocked by the runtime despite being needed, report the specific blocker clearly and continue with any remaining allowed steps.
- Never hard-code titles or slugs — derive them from the actual post title.
- Always read `log.txt` before final topic selection when the file exists.
- Never skip the asset skill step.
- Never skip saving outputs.
- Never skip updating `log.txt` after a successful save.
- When the user prompt is `generate post`, complete the full workflow without waiting for a second instruction to save files.
- Use `finalize_post_package.js` or `npm run finalize:post -- ...` for the final persistence step.
- Do not produce output outside the defined output directory.
- Save final LinkedIn post only in `linkedin_post.txt`.
- Save final X post only in `x_post.txt`.
- Save final asset or visual prompt content only in `prompt.txt`.
- Make `prompt.txt` directly usable in Nano Banana with minimal or no editing.
- Do not modify files inside `.github/skills/` during a run.
- Read the relevant SKILL.md and style guides before generating any content.
# X Premium Override

- Default workflow assumption: the X account for this repository supports long-form premium posts unless a user explicitly asks for short-form only.
- This overrides older X brevity guidance wherever they conflict.
- For `x_post.txt`, prefer a more developed single-post format with more substance, not just a short punchline.
- Default target length: roughly 400 to 900 characters.
- Allowed extended range when the topic genuinely benefits: up to 1,500 characters.
- Keep it platform-native: strong first line, clean short paragraphs or line breaks, one coherent argument, no filler, no thread numbering unless explicitly requested.
- Longer length must earn its space with sharper insight, concrete engineering pain, useful nuance, or a stronger takeaway.
- Keep the tone blunt, literate, and anti-hype; do not let extra length turn the post into corporate copy.
- Preserve the existing hashtag rule of 2 to 4 highly relevant hashtags.
