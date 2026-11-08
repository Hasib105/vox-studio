---
name: vox-studio
description: Make a Vox-style paper-collage explainer video (news, explainers, shorts) entirely locally with the vox-studio engine in this repo. JSON story in, MP4 out, real maps, captions in any language (incl. Bangla), optional procedural SFX. No cloud services, no credits. Trigger for "Vox style video", "collage explainer", "paper collage animation", "news short", "explainer short", "make a video about <topic>" in this repo.
---

# vox-studio: local Vox-style explainers

Everything runs on this machine: `node src/cli.js ...` (or the `vox-studio` MCP tools if connected).
Speak the user's language. No em dashes in on-screen copy.

## Workflow

1. **Read the docs once per session**: `docs/STORY_FORMAT.md` (format, components, animations, maps) and
   `docs/DESIGN_RULES.md` (Vox rules). `node src/cli.js components` prints every component and prop.
   Study `stories/iron-gate.en.json`: it is a complete, reviewed example of every technique.
2. **Facts.** For news, verify with web search; keep URLs in `"sources"` and put a short source label on the
   stat shot and the last shot. Mark unconfirmed details as "reports say".
3. **Beat map (approval gate).** Propose 6-8 shots (~35s) as a table: shot, headline (wide shots only),
   caption, visuals, camera move, transition. Hook lands in under 3 seconds. Wait for "go" unless the user
   already said to just make it.
4. **Write the story** to `stories/<slug>.json`. Start from the closest example. Use real `map` elements
   whenever the story has a place. Vary camera moves between adjacent scenes; `static` only for the payoff.
5. **Review by eye (mandatory).**
   - `node src/cli.js check stories/<slug>.json`
   - `node src/cli.js stills stories/<slug>.json` then Read the sheet PNG.
   - Inspect animation: `node src/cli.js stills <file> --scene 3 --times 0.1,0.4,0.8`
   - Close look: `node src/cli.js frame <file> 12.5 -o output/f.png`
   Fix clipped labels (keep text inside x 90-990), overlaps, text over busy art, dead frames, then re-check.
6. **Render.** `node src/cli.js render stories/<slug>.json [--sfx] [-o output/<slug>.mp4]`
   (~1-2 min for 40s at 1080x1920 using parallel workers; `--scale 0.5` for a fast draft).
   Verify with frames from the MP4 (`node_modules/ffmpeg-static/ffmpeg -i out.mp4 -vf "select=..."`).
7. **Deliver** the MP4 path, the caption script, and sources.

## Styles and quality
- 9 themes restyle any story: `vox-news`, `scrapbook`, `protest`, `papercraft`, `noir`, `riso`, `blueprint`,
  `retro70s`, `swiss` (`node src/cli.js themes`). Pick by topic: news → vox-news/protest/noir, science and
  how-it-works → blueprint/papercraft, history → retro70s/noir, lifestyle → scrapbook/riso, data → swiss.
  Show the user `node src/cli.js gallery <story> --scenes 1,3` to choose by eye.
- Each theme has a matching example story in `stories/` (see `docs/STORY_FORMAT.md`, "Example stories").
- Final renders: `--quality high` (default) or `max`; `--resolution 4k` for 16:9. Drafts: `--quality draft`.
- 16:9: set `"format": "16:9"` and lay out for 1920x1080 (headline left, visual right works well).

## Translations
Copy the story, set `"lang"` (e.g. `"bn"`), translate every `text`, `caption`, `headline` and map `labels`
string. Bangla uses Hind Siliguri automatically and native digits in `counter`. Re-run stills: translated
labels are often wider, so nudge `dx` on labels near the frame edge.

## Gotchas
- Geo positions (`{"geo": [lon, lat]}`) need a `map` element earlier in the same scene.
- `flipX` keyframes passing through 0 make the element vanish for a frame; that reads as a paper flip.
- Keep captions 8-16 words; they reveal word by word at ~10 words/s (8 for Bangla).
- Audio is off unless the story sets `"audio": {"sfx": true}` or you pass `--sfx`.
