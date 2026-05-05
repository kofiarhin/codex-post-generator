---
name: linkedin-post-assets
description: Analyzes the completed LinkedIn and X posts, extracts the central emotional tension and visual metaphor, and generates one production-ready Nano Banana prompt for a professional social thumbnail or graphic. Saves the prompt to `_post_suggestion/<slug>/prompt.txt`.
---

# Skill: linkedin-post-assets

## Purpose

This skill generates the visual prompt for the social post package.
It does not research topics and it does not write the social posts.

Its job is to take the finished post package and produce one final, directly usable,
Nano Banana-optimized prompt aligned with the post tone.
The full orchestrator finalizer then uses the saved prompt as the image generation prompt
and saves the generated image as `_post_suggestion/<slug>/thumbnail.png`.

Read `assets/thumbnail-style-guide.md` before generating the prompt.
Use `assets/asset-output-template.md` as the structure for the saved prompt text.

---

## Input

Provide:

- post title
- selected topic
- completed LinkedIn post
- completed X post
- keyword theme if available

---

## Workflow

Execute the following steps in order.

---

### Step 1 — Analyze the Post Package

Read the finished posts carefully.

Extract and define:

```
Primary Emotional Tone: <dominant emotional effect>
Secondary Emotional Tone: <supporting emotional layer>
Audience Pain Point: <specific developer frustration or tension>
Strongest Visual Metaphor: <single concrete scene or subject>
Core Insight: <one sentence practical takeaway>
```

Keep this analysis internal unless it helps you craft a better final prompt.

---

### Step 2 — Define Visual Direction

Using the emotional analysis, define the visual direction for a professional social thumbnail or post graphic.

Bias toward:

- clean, premium, editorial or commercial illustration quality
- one focal subject
- simple composition
- professional credibility with a subtle witty edge
- muted modern palette with one accent color
- visuals that stay readable at thumbnail size

Avoid:

- meme aesthetics
- cluttered UI collages
- generic stock photo scenes
- floating code on dark backgrounds
- random futuristic tech clichés
- noisy interface text

---

### Step 3 — Write One Nano Banana Prompt

Generate one production-ready prompt.

The prompt must:

- start with the core scene in the first sentence
- explicitly describe subject, setting, composition, lighting, mood, palette, and rendering style
- align with the grounded, witty, professionally literate tone of the posts
- prefer realistic editorial, premium commercial illustration, or polished digital art styles
- include constraints such as no logos, no watermarks, no clutter, no distorted hands, and no unreadable interface text
- optimize for a high-quality LinkedIn thumbnail or social graphic with a strong focal point
- include a short text overlay section based on the selected topic or final post title
- state that the text overlay is centered in the middle of the thumbnail

Do not turn the output into a brainstorm list.

---

### Step 4 — Save the Prompt

Save the final prompt using:

```bash
node .agents/skills/linkedin-post-assets/scripts/save_asset.js "<Post Title>" "<path/to/prompt.txt>"
```

This must create:

```bash
_post_suggestion/<short-slug>/prompt.txt
```

When this skill is used inside the full `generate post` workflow, the preferred final persistence step is the orchestrator finalizer:

```bash
npm run finalize:post -- "<Post Title>" "<path/to/linkedin-post.txt>" "<path/to/x-post.txt>" "<path/to/prompt.txt>" "<Primary Keyword>" "<Topic Angle>"
```

That finalizer saves all text files, generates `thumbnail.png` from the saved `prompt.txt`,
and updates `log.txt` only after the package is complete.

Thumbnail generation requires `GEMINI_API_KEY` in the root `.env` file or the shell environment.

Print the saved output path when complete.

---

## Final Output Format

The saved output must be a single prompt text file that is directly usable in Nano Banana.

It must contain:

- one main generation prompt
- one short text overlay section after the main prompt

It must not contain a brainstorm list, prompt variants, or markdown-heavy briefing sections.

---

## Rules

- Do not generate a generic prompt.
- Do not produce more than one main prompt.
- Do not save outside `_post_suggestion/<slug>/prompt.txt`.
- Keep the image concept aligned with the same topic and tone as the posts.
- Make the final prompt usable with minimal or no editing.
- Make the overlay text topic-based and readable at thumbnail size.
- Center the overlay in the middle of the thumbnail.
