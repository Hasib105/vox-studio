# Vox-style design rules

What makes these feel like a Vox explainer rather than a slideshow. Follow them when writing a story.

## Story
- **Hook in under 3 seconds.** Shot 1's headline carries the payoff ("BLOCKADE GOES ON LAND"), never setup.
- **Beats of two shots:** a *wide* shot with the headline that orients, then a *detail* cut-in without a
  headline that shows one thing up close. The caption sentence spans the beat.
- **4-6 seconds per shot**, never more than 7. ~30s = 6-8 shots, ~60s = 10-12 shots.
- Arc for news: Hook → Context (what was true before) → What changed → Why it matters / what's unknown.
- Captions: one idea per shot, 8-16 words, ~2.5 words/sec. Highlight 2-4 key words with `*...*`.
- **Facts first.** Every number and claim must come from a source; put a small source label on a stat shot
  and the last shot. Use "reports say" for unconfirmed details.

## Look
- **One bold flat background color per scene**, and let the palette travel (red hook → navy → sea blues →
  mustard stat → teal map → orange → slate → dark close).
- Everything is **paper**: pieces have torn edges, a cream fringe, soft drop shadows, halftone on big shapes.
  Layer 3-6 pieces per shot: background texture (halftone/newspaper), main subject, labels, accents.
- Big type: headlines 2-4 words; labels 1-3 words. Keep text inside x 90-990 and away from y > 1600
  (Shorts UI) and the right edge 990+ between y 900-1600 (Shorts buttons).
- Maps beat abstract shapes: if the story has a place, show the real map and put the action on it.

## Motion
- **Something moves every 3-5 seconds.** Stagger entrances (`at` 0.2-0.4s apart), never all at once.
- **Anti-monotony:** no two adjacent scenes share a camera move. `static` is reserved for the payoff shot.
- Save the punches (gate slam, stamp, impact shake, burst) for the hook, the reveal and the payoff.
- Use transitions sparingly: `cut` within a beat, `tear`/`whip` between beats.
- Give heroes a loop (`bob`, `sway`, `pulse`) so frames never freeze; background pieces `drift` with `depth`.

## Review loop
1. `vox_validate_story` → fix errors.
2. `vox_preview` → look at every scene: clipped labels? overlaps? empty corners? text over busy art?
3. Inspect animated scenes with `scene` + `times` (e.g. [0.1, 0.4, 0.8]) to check entrances land.
4. Render a `scale: 0.5` draft if motion timing matters, then the full render.
