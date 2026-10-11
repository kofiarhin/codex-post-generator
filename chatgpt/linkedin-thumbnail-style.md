# LinkedIn Thumbnail Style

## Purpose

Define the visual system for LinkedIn post thumbnails.

All generated thumbnails should follow this file and the thumbnail reference images stored in Project Sources.

The goal is a clean technical editorial cover optimized for the LinkedIn feed.

## Locked Dimensions

Always target:

1200 × 627 px

Aspect ratio:

1.91:1 landscape

Preferred format:

PNG

Never default to:

- square
- portrait
- 16:9 YouTube dimensions

If exact generation dimensions are unavailable, generate the closest 1.91:1 landscape composition and resize or crop to 1200 × 627 when possible.

## Visual Direction

The thumbnail should look like a modern technical editorial graphic.

It should NOT look like:

- a YouTube thumbnail
- an infographic
- a tutorial card
- a poster
- a slide
- an advertisement

The design should communicate one idea immediately.

## Headline

Use one dominant headline.

Length:

2–5 words preferred.

The headline should represent the engineering consequence or thesis.

Examples:

MODELS AREN'T INFRASTRUCTURE

YOUR API IS TEMPORARY

RELIABILITY BEFORE FEATURES

TOOLS NEED CONTRACTS

THE ABSTRACTION WILL LEAK

MODEL UPGRADES BREAK THINGS

Do not merely repeat the article, transcript, or video title.

Generate three headline options internally and select the strongest.

## Text Overlay Style

Use a short editorial headline expressing the post's engineering argument.

Prefer 2–5 words, clear language, and one defensible claim. Generate three options internally and choose the strongest.

Good examples:

- MERGE APPROVAL STAYS HUMAN
- TEST THE FAILURE PATH
- TOOLS NEED CONTRACTS
- PERMISSIONS NEED BOUNDARIES
- PASSING IS NOT PROOF

Choose wording that fits the actual thesis. These are illustrations, not templates.

Do not manufacture drama or use “disciplined technical clickbait”. Do not imply an agent escaped, a company lost control, a model lied, or production broke unless verified evidence establishes that exact claim and it is central to the argument.

Company or product names are optional. Use them only when central and helpful for recognition.

Reject headlines that exaggerate certainty, depend on missing context, or force the post to walk back their claim.

The headline must pass both tests:

1. Does it communicate the engineering position clearly?
2. Can every word be defended by the post and its evidence?

## Thumbnail Role

Create a matching thumbnail unless the user requests text-only. For text-only requests, omit the thumbnail and image filename.

The image supports a strong argument. It does not compensate for a weak topic.

Use reference images for palette, typography, and composition. Their wording does not override the current editorial rules.

## Typography

Use:

- large bold sans-serif typography
- high contrast
- clean letterforms
- strong hierarchy
- short line breaks

Headline text must remain readable when the image appears small in the LinkedIn mobile feed.

The headline should be the primary visual element.

## Layout

Prefer:

Headline on one side.

One supporting technical visual on the other.

OR:

Large centered headline with a restrained background motif.

Keep the composition simple.

Use generous negative space.

Limit the thumbnail to one primary visual idea.

## Safe Area

Keep essential content approximately:

80 px from left and right edges.

50 px from top and bottom edges.

Do not place important text or visual information against the edges.

## Supporting Visuals

Use one restrained technical motif.

Examples:

- API connection
- server blocks
- model blocks
- dependency graph
- network nodes
- architecture layers
- terminal abstraction
- database symbol
- cloud infrastructure
- warning/deprecation symbol
- agent/tool relationship
- pipeline
- model routing
- security boundary

Visual elements should support the headline rather than compete with it.

## Background

Dark technical/editorial styling is preferred when appropriate.

Possible treatments:

- near-black background
- dark navy
- subtle gradients
- faint grids
- restrained circuit patterns
- subtle code/interface texture
- controlled glow around one technical element

Keep backgrounds visually quiet.

## Color

Use a small palette.

One accent color is usually sufficient.

Avoid rainbow gradients or multiple competing accent colors.

Use color primarily for emphasis and hierarchy.

## Branding

Company/product logos may be used when they materially clarify the topic.

Keep branding restrained.

Do not make the graphic look like official marketing from the company.

Do not imply endorsement.

## Hard Prohibitions

Do not create:

- human creator faces by default
- exaggerated facial expressions
- subscriber counts
- episode labels
- "NEW VIDEO"
- YouTube play buttons
- arrows everywhere
- stickers
- promotional badges
- dense feature lists
- more than two text blocks
- paragraphs
- tiny annotations
- complicated diagrams
- multiple screenshots
- fake UI
- crowded dashboards
- copied source thumbnails

## Source Images

If the user attaches a YouTube thumbnail, screenshot, article image, or reference graphic:

Use it to understand the topic.

Do not reproduce its layout.

Do not inherit its YouTube visual language.

Distill the topic into the established LinkedIn editorial system.

## Thumbnail/Post Alignment

The post and thumbnail must communicate the same thesis.

Example:

Post thesis:
MCP standardizes tool discovery, but developers still own tool contract quality.

Possible headline:

PROTOCOLS DON'T MAKE TOOLS SAFE

The thumbnail should represent that idea rather than:

BUILD YOUR FIRST MCP SERVER

## Quality Gate

Before returning a thumbnail, verify:

Is it 1200 × 627 or prepared for that size?

Can the headline be read quickly on mobile?

Is there only one dominant idea?

Does it look editorial rather than promotional?

Does the visual support the engineering thesis?

Does it avoid YouTube-style composition?

Would removing decorative elements improve it?

If the thumbnail fails any major criterion, regenerate it.

## Suggested Filename Relationship

The visual headline and filename do not need to match exactly.

The filename should describe the searchable technical topic.

Example:

Thumbnail:
TOOLS NEED CONTRACTS

Filename:
mcp-tool-contract-api-design.png
