# RALPH Article/Post Loop

Use this loop when the requested output includes a full article, an explicit pipeline package, or a
resumable handoff package. Do not insert it into the normal `generate post` social package workflow
unless the user explicitly asks for article generation or the RALPH/pipeline path.

The original codex-post-generator flow is preserved:

1. Existing setup and input gathering
2. Existing topic research, duplicate checks, selection, and SEO planning when those steps apply
3. RALPH article/post loop
4. Existing save/finalization behavior for the requested package

## Stage Names

- R = Research/Requirements
- A = Article/Post Draft
- L = Loop Review/Refine
- P = Polish
- H = Health Check

## Required RALPH Artifacts

Save RALPH artifacts in the selected package directory:

```text
_post_suggestion/<short-slug>/article_requirements.md
_post_suggestion/<short-slug>/article_draft.md
_post_suggestion/<short-slug>/article_review_notes.md
_post_suggestion/<short-slug>/polish_decision.json
_post_suggestion/<short-slug>/article_polished.md
_post_suggestion/<short-slug>/polished_package.json
_post_suggestion/<short-slug>/article_health_check.md
_post_suggestion/<short-slug>/workflow_state.json
_post_suggestion/<short-slug>/workflow_summary.json
```

The four required user-facing loop artifacts are:

- draft article: `article_draft.md`
- review/refinement notes: `article_review_notes.md`
- polished article: `article_polished.md`
- final health-check summary: `article_health_check.md`

`article_requirements.md`, `polish_decision.json`, `polished_package.json`, `workflow_state.json`,
and `workflow_summary.json` are workflow support artifacts used for quality control and resume/handoff.

## Resume And Handoff State

Maintain `workflow_state.json` after every completed stage.
The state file must record:

- article title and slug
- current stage and next stage
- completed stages
- last updated timestamp
- status for each completed stage
- canonical artifact path for each completed stage
- top-level artifact paths
- review iteration count
- pass/fail checks for the stage
- artifact SHA-256 hash
- completion timestamp

To resume, read `workflow_state.json` first and continue from `nextStage`.
Do not regenerate completed artifacts unless the user asks for a revision or a completed stage failed validation.

Maintain `workflow_summary.json` with:

- `ralphStagesCompleted`
- `reviewIterationsUsed`
- `polishCompleted`
- `healthCheckPassed`
- `finalOutputPaths`

Use the state helper when saving stage output:

```bash
node .agents/skills/linkedin-post-orchestrator/scripts/record_ralph_stage.js "<Article Title>" "<stage>" "<artifact-input-path>"
```

Accepted stages:

- `R` or `research_requirements`
- `A` or `article_draft`
- `L` or `loop_review`
- `P` or `polish`
- `H` or `health_check`

Run validation before final output:

```bash
npm run validate:ralph -- "<Article Title>"
```

## R - Research/Requirements

Purpose: confirm the article goal before drafting.

Produce `article_requirements.md` with:

- article goal
- target audience
- source inputs and citations or source notes
- chosen angle
- constraints
- SEO requirements
- title requirements
- target length and format
- known exclusions or claims to avoid

Pass checks:

- PASS if the goal is explicit.
- PASS if the audience is specific.
- PASS if source inputs are listed or the lack of provided sources is stated.
- PASS if the angle is differentiated from prior `log.txt` entries when topic selection overlaps.
- PASS if SEO/title requirements are captured.
- FAIL if the article can be drafted in multiple incompatible directions.

## A - Article/Post Draft

Purpose: create the first complete article, not a skeleton.

Produce `article_draft.md` with:

- working title
- complete introduction
- clear headings
- complete body sections
- examples or concrete technical detail where useful
- conclusion
- CTA when appropriate

Pass checks:

- PASS if the draft is complete end to end.
- PASS if it follows the requirements artifact.
- PASS if the primary keyword appears naturally in the title, intro, or early body.
- PASS if headings describe the article's argument rather than generic sections.
- FAIL if major sections are placeholders.

## L - Loop Review/Refine

Purpose: review and refine the draft before polishing.

Produce `article_review_notes.md` with:

- requirements fit
- structure issues
- clarity issues
- originality and differentiation notes
- tone notes
- usefulness/practicality notes
- SEO/title notes
- prioritized refinements for the polish pass

Pass checks:

- PASS if the review names concrete issues, not vague praise.
- PASS if each major requirement is checked.
- PASS if revision priorities are actionable.
- PASS if originality and usefulness are explicitly assessed.
- FAIL if the review would not help another agent improve the article.
- FAIL if this would exceed 3 review/refine iterations.

## P - Polish

Purpose: improve the draft using the approved review/refine notes.

Produce `article_polished.md`, `polish_decision.json`, and `polished_package.json`.

`polish_decision.json` must record:

- review approval status
- review iteration count
- decision to proceed to health check or the reason it cannot proceed
- paths to the review and polished artifacts

`polished_package.json` must record:

- title and slug
- workflow marker
- review iteration count
- final output paths known at polish time

`article_polished.md` must include:

- tightened introduction
- stronger headings
- smoother transitions
- clearer examples
- sharper conclusion
- CTA that fits the article goal
- removed filler and repeated points

Pass checks:

- PASS if the polished article resolves the review's high-priority notes.
- PASS if the intro, headings, transitions, examples, conclusion, and CTA were reconsidered.
- PASS if the tone matches the requested audience and repo style.
- PASS if SEO terms are natural rather than stuffed.
- FAIL if it is only a light copy edit of the draft.
- FAIL if either polish JSON artifact is missing.

## H - Health Check

Purpose: verify the final article before output.

Produce `article_health_check.md` with:

- final pass/fail result
- requirements coverage summary
- source/claim risk notes
- structure and readability result
- SEO/title result
- originality/tone/usefulness result
- final output path
- remaining gaps, if any

Pass checks:

- PASS if all required artifacts exist and validate.
- PASS if the polished article satisfies the R-stage requirements.
- PASS if claims are sourced, caveated, or marked as needing verification.
- PASS if no placeholders remain.
- FAIL if any required stage is missing, failed, or impossible to verify.
- FAIL if `workflow_state.json`, `polish_decision.json`, `polished_package.json`, or `workflow_summary.json` is missing.

## Validation

Run:

```bash
npm run validate:ralph -- "<Article Title>"
```

The validator checks canonical artifacts, state completeness, required stage order, max 3 review
iterations, polish artifacts, health-check artifacts, workflow summary fields, artifact hashes, and
stage status.
It does not judge prose quality; the L and H stages must do that work explicitly.
