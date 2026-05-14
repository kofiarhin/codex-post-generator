# post-generator

Codex-powered content workflow for software topics.

The original workflow is still the default: `generate post` creates a LinkedIn post, an X post, a Nano Banana prompt, and an SEO-named thumbnail under `_post_suggestion/<short-slug>/`, then updates `log.txt` after the full package is complete.

## Default Social Post Workflow

Use:

```bash
npm run generate:post -- "<Post Title>" "<linkedin-input-path>" "<x-input-path>" "<prompt-input-path>" "<primary-keyword>" "<topic-angle>"
```

The final package contains:

```text
_post_suggestion/<short-slug>/linkedin_post.txt
_post_suggestion/<short-slug>/x_post.txt
_post_suggestion/<short-slug>/prompt.txt
_post_suggestion/<short-slug>/<seo-topic-keyword-software-development-linkedin-thumbnail>.png
_post_suggestion/<short-slug>/workflow_receipts.json
```

Audit saved social packages with:

```bash
npm run audit:workflow
```

## Thumbnail Generation

The finalizer sends the full saved `prompt.txt` to Hugging Face text-to-image when configured:

```bash
IMAGE_GENERATION_PROVIDER=huggingface
HF_TOKEN=hf_your_token_here
HF_IMAGE_MODEL=black-forest-labs/FLUX.1-schnell
```

Set `IMAGE_GENERATION_PROVIDER=local` to force the built-in PNG renderer. If Hugging Face fails,
the workflow falls back to local rendering and records the provider, model, fallback reason, prompt
hash, thumbnail hash, width, and height in `workflow_receipts.json`.

## Optional RALPH Article/Post Loop

When the requested output includes a full article, pipeline package, or resumable handoff package,
keep the existing setup, research, duplicate check, topic selection, and SEO planning steps where
they apply. Then run the content package through RALPH:

- R: Research/Requirements
- A: Article/Post Draft
- L: Loop Review/Refine
- P: Polish
- H: Health Check

The default LinkedIn/X social workflow remains the lightweight path unless RALPH/pipeline mode is
requested.

Each RALPH run writes these files under `_post_suggestion/<short-slug>/`:

```text
article_requirements.md
article_draft.md
article_review_notes.md
polish_decision.json
article_polished.md
polished_package.json
article_health_check.md
workflow_state.json
workflow_summary.json
```

The required user-facing artifacts are the draft article, review/refinement notes, polished article,
and final health-check summary. The requirements, polish JSON, state, and summary files make the
workflow auditable and resumable.

## Recording RALPH Stages

After writing a stage artifact, record it into the package directory:

```bash
npm run ralph:record-stage -- "<Article Title>" "R" "<path-to-requirements.md>"
npm run ralph:record-stage -- "<Article Title>" "A" "<path-to-draft.md>"
npm run ralph:record-stage -- "<Article Title>" "L" "<path-to-review-notes.md>"
npm run ralph:record-stage -- "<Article Title>" "P" "<path-to-polished-article.md>"
npm run ralph:record-stage -- "<Article Title>" "H" "<path-to-health-check.md>"
```

Accepted stage names are `R`, `A`, `L`, `P`, `H`, or their full keys:

```text
research_requirements
article_draft
loop_review
polish
health_check
```

To resume an interrupted RALPH workflow, read:

```text
_post_suggestion/<short-slug>/workflow_state.json
```

Continue from `nextStage`. Completed stages should not be regenerated unless the user asks for a revision or validation fails.

## Validation

Validate one article package:

```bash
npm run validate:ralph -- "<Article Title>"
```

Validate all article packages with state files:

```bash
npm run validate:ralph
```

The validator checks that all RALPH artifacts exist, every stage passed, state is complete, no more
than 3 review iterations were used, polish artifacts exist, the health check exists, summary fields
are present, hashes match the saved artifacts, and `nextStage` is complete.
