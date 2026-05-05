# LinkedIn Visual Asset Style Guide

This guide defines the visual direction standards for the final Nano Banana prompt
produced by the `linkedin-post-assets` skill. Read this before generating the prompt.

---

## Platform Context

LinkedIn is a professional network with a feed that skews toward:
- Text posts with high engagement
- Document carousels
- Link previews with thumbnails
- Occasional image posts

Visuals must work in a professional context. They are not YouTube thumbnails.
They are not Instagram graphics. They should feel credible to an audience that reads
engineering blogs late at night and opens pull requests before coffee.

---

## Aesthetic Direction

### Palette

- Prefer muted, modern palettes: dark navy, charcoal, warm grey, deep teal
- Use one accent color for contrast: bright blue, electric green, warm amber, clean white
- Avoid: loud gradients, neon everything, rainbow color schemes
- Monochrome with a single accent is almost always the right call

### Composition

- One clear focal subject — not a collage, not a grid
- Generous whitespace — do not fill every pixel
- Text placement: centered in the middle of the thumbnail for the final overlay, never decoratively scattered
- Hierarchy: visual subject first, text second
- The viewer must understand the image in under 2 seconds
- Optimize for a thumbnail-first read even when the asset is used in a larger format
- Prefer a cinematic technology editorial frame: a believable developer, workstation, monitor, security console, architecture diagram, or other concrete engineering scene as the main subject
- When UI is visible, make it look like a large polished product/security dashboard with broad readable panels and short labels, not a wall of tiny code
- Use strong foreground, midground, and background separation so the image has depth instead of looking flat or posterized

### Image Quality

- Ask for a 16:9 LinkedIn thumbnail with premium editorial production value and 2K-ready detail
- Specify sharp focus, crisp edges, realistic materials, physically plausible shadows, and cinematic but believable lighting
- Use clean depth of field and controlled contrast; the output should feel like a high-end tech magazine cover, not a generic AI illustration
- Avoid low-resolution artifacts, smeared faces, warped monitors, malformed UI, noisy pseudo-text, overprocessed glow, and plastic-looking skin
- If the overlay crosses detailed content, request a subtle dark translucent center band to preserve text contrast without hiding the scene

### Mood

- Clean and confident — not sterile, not try-hard
- A slight edge of dry wit is appropriate if it suits the post
- The image should feel like it was made by someone who knows what they're doing
- Not corporate clip art. Not startup hustle aesthetic.
- Match the post voice: grounded, technically literate, and lightly skeptical of hype

### Typography (when text is part of the prompt)

- Bold sans-serif preferred: Inter, Helvetica Neue, DM Sans, or similar
- Short phrases only — overlay text should be 3 to 8 words maximum
- High contrast text on background — never fight for legibility
- Center-align the overlay and keep it anchored in the middle of the thumbnail
- No all-caps unless it is genuinely impactful

---

## Asset-Specific Guidance

The workflow now saves one final `prompt.txt`, but that prompt should still be suitable for
the most common use cases below.

### Thumbnail (1200 × 628 px)

The thumbnail appears as a link preview. Most viewers see it as a small rectangle.

- Ensure the subject reads at small sizes — no fine detail that disappears
- Leave room for LinkedIn's overlay behavior (platform may add rounded corners)
- A clean, high-contrast image with one dominant element performs best
- Text overlay is required in the final prompt, should be topic-based, and should stay to one centered line when possible

### Square Social Graphic (1080 × 1080 px)

Used as a post image or carousel slide.

- More room for detail than the thumbnail
- Can carry more context: a short quote, a visual metaphor developed further
- Still follow single-subject composition rules
- Can work as a standalone piece without requiring the post text

### Carousel Cover (1080 × 1080 px)

The first slide a viewer sees. Must earn the swipe.

- Strong visual hook — something unresolved, surprising, or immediately engaging
- The cover should pose a question the slides will answer, visually or textually
- Minimal text: title or hook phrase only
- High visual contrast to stand out in the feed

---

## What to Avoid

| Avoid | Why |
|-------|-----|
| Meme templates | Look cheap, reduce credibility |
| Stock photo compositions | Generic and forgettable |
| Floating code snippets on dark backgrounds | Overused dev aesthetic |
| Binary rain / circuit boards | Dated and meaningless |
| Dashboard screenshots (busy) | Too cluttered, no focal point |
| YouTube-style faces | Wrong context, wrong platform |
| Neon glow effects everywhere | Visually aggressive, hard to read |
| Emoji-heavy graphics | Distracting and unprofessional |
| Generic "tech" imagery | Adds nothing specific to the post |

---

## Nano Banana Prompt Rules

- Write one production-ready prompt, not multiple prompt options.
- Start with the core scene in the first sentence.
- Be explicit about subject, setting, composition, lighting, mood, color palette, and rendering style.
- Include production-quality language: 16:9 LinkedIn thumbnail, 2K-ready detail, sharp focus, cinematic but believable lighting, clean depth of field, crisp edges, and no low-resolution artifacts.
- Prefer realistic editorial, premium commercial illustration, or polished digital artwork.
- Include clear constraints: no logos, no watermarks, no clutter, no distorted hands, no unreadable UI text.
- Include a short text overlay section after the main prompt.
- Base the overlay text on the selected topic or final post title.
- State that the overlay must be centered in the middle of the thumbnail.
- Avoid vague phrases such as “make it cool” or “futuristic vibe.”
- Keep the concept simple enough to remain readable as a social thumbnail.

---

## Quality Checklist

Before finalizing any prompt, verify:

- [ ] The prompt is specific to this post's topic — not generic
- [ ] The composition has one clear focal subject
- [ ] The palette is muted with one accent
- [ ] The prompt would not produce a stock-photo aesthetic
- [ ] Overlay text is included, topic-based, and under 10 words
- [ ] Overlay placement is centered in the middle of the thumbnail
- [ ] The image would still read clearly at thumbnail size
- [ ] The visual connects emotionally to the post's tone
- [ ] No YouTube-style elements unless requested
