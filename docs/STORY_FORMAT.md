# vox-studio story format

A **story** is one JSON file describing a whole video. The canvas is **1080 x 1920** (9:16) by default; every
coordinate below is in those pixels, origin top-left. Scenes play back to back.

```json
{
  "title": "My explainer",
  "lang": "en",                 // en | bn | hi | ... (picks fonts, native digits, caption pacing)
  "format": "9:16",             // 9:16 | 16:9 | 1:1 | 4:5
  "theme": "vox-news",          // vox-news | scrapbook | protest | papercraft | noir | riso | blueprint | retro70s | swiss
  "quality": "high",            // draft | standard | high (default) | max
  "resolution": "1080p",        // 720p | 1080p | 1440p | 4k (relative to the format)
  "fps": 30,
  "audio": { "sfx": false, "music": "music/bed.mp3", "musicVolume": 0.35 },
  "sources": ["https://..."],   // for your records; also put a source label on screen
  "scenes": [ /* ... */ ]
}
```

## Scene

```json
{
  "id": "1-hook",
  "dur": 5,                                   // seconds (keep 4-6)
  "bg": "#c1121f",                            // one bold flat color per scene
  "camera": { "move": "push_in", "amount": 0.08 },
  "transition": "tear",                       // how this scene enters: cut | tear | whip | slide | flash | zoom
  "shakes": [{ "at": 1.75, "amp": 18 }],      // impact shakes (seconds into the scene)
  "headline": { "text": "BLOCKADE GOES\nON LAND", "style": "dark" },
  "caption": "*Nov 7:* the US launched *Task Force Iron Gate.*",
  "elements": [ /* drawn in order, later = on top */ ]
}
```

- **headline**: big torn-paper banner, baked into the poster (moves with the camera). Styles: `dark`, `light`,
  `red`, `yellow`, `cream`, `accent`. Options: `y` (default 300), `max` (font size cap), `rot`, `at`, `bg`, `color`.
  Use `\n` to break lines. 2-4 words. Put it on the first ("wide") shot of each beat, not every shot.
- **caption**: the on-screen narration strip near the bottom (y 1450, above the Shorts UI). Words appear one by
  one. Wrap words in `*asterisks*` for the yellow marker highlight. Object form: `{"text": "...", "at": 0.3}`.
- **camera.move**: `static`, `push_in` (amount), `pull_out` (amount), `pan` (from, to px), `tilt` (from, to px),
  `parallax` (amount px; elements move by `depth`), `drift`. Or keyframe `s`, `tx`, `ty`, `rot` directly.

## Elements

Every element has a `type` (see component catalog) plus common props:

| prop | meaning |
|---|---|
| `x`, `y` | position (default frame center). Or `pos`: `[x, y]` or `{"geo": [lon, lat], "dx": 0, "dy": 0}` |
| `rot`, `scale`, `scaleX`, `scaleY`, `flipX` | transform (`flipX: -1` mirrors; keyframe it to turn a ship around) |
| `opacity`, `depth` | alpha; parallax depth (0.4 = far background, 1 = foreground) |
| `jitter` | stop-motion boil (default from theme, 0 = steady) |
| `seed` | change the torn-edge shape |
| `show` | `[t0, t1]` visible window in seconds |
| `enter`, `exit`, `loop` | animations (below) |
| `sfx`, `sfxAt`, `sfxEvents` | sound overrides (`"sfx": "none"` to mute) |
| `each` | array of overrides → stamps out one copy per item (great for rows of ships, labels, arrows) |

**Absolute components** (`map`, `arrow`, `path`, `chain`, `wave`, `scraps`, `halftone`) draw in frame
coordinates; their own `from`/`to`/`points`/`y` props say where.

### Animations

`enter` — how it arrives. String (`"pop"`) or object (`{"anim": "pop", "at": 0.6, "dur": 0.4}`).

| anim | effect | extra |
|---|---|---|
| `pop` | scale up with overshoot | |
| `fade` | fade in | |
| `slide` | slides in from an edge | `from`: left/right/top/bottom, `dist` |
| `drop` / `rise` | falls in from above / rises from below | `dist`, `shake`: amp (impact on landing) |
| `stamp` | slams down from big scale (rubber stamp) | `scale` |
| `fly` | arcs in from an offset or point | `from`: [dx,dy] or `fromPos`: [x,y], `arc` |
| `grow` | draws itself (arrows, paths, uturn) | |
| `unfold` | grows upward (people, bars) | |
| `spin` | spins in | `turns` |
| `none` | already there | |

Any enter can take `"shake": 14` to add a camera shake when it lands.

`exit` — `{"anim": "fade" | "pop" | "slide" | "drop", "at": 3.5, "dur": 0.3}`.

`loop` — continuous motion, string or object or array: `bob`, `sway`, `pulse`, `drift`, `spin`, `flutter`,
`shiver`. Options `amp`, `speed`. Loops run "on twos" (12 fps) for a stop-motion feel.

### Keyframes (any numeric prop)

```json
"x": { "from": -250, "to": 660, "at": 0.1, "dur": 1.3, "ease": "out" }
"x": { "kf": [[0.15, 1350], [1.65, 560, "out"], [2.2, 560], [4.4, 1260, "inOut"]] }
```
Each `[t, value, ease]` — the ease applies on the way **into** that key. Eases: `linear`, `in`, `out`, `inOut`,
`back`, `softBack`, `backIn`, `elastic`, `bounce`, `step`. Works for `x`, `y`, `rot`, `scale`, `flipX`,
`opacity`, component props like `close`, `open`, `value`, `progress`, and nested props like `border.progress`.

## Maps (real geography)

```json
{ "type": "map", "id": "m", "x": 540, "y": 900, "w": 900, "h": 700,
  "focus": ["Iran"],                          // fit + lift these countries
  "card": { "color": "#4ea8de", "pad": 30 },  // torn water card behind; neighbors clipped to it
  "border": { "of": "Iran", "progress": { "from": 0, "to": 1, "at": 0.3, "dur": 1.6 } },
  "labels": [{ "text": "IRAN", "geo": [54.5, 32.4], "size": 96 }],
  "enter": "pop" }
```
- `bounds: [[lonW, latS], [lonE, latN]]` instead of `focus` to frame a region (straits, cities). Use
  `"detail": "10m"` for tight zooms, `"50m"` default, `"110m"` for whole continents.
- `countries: "focus"` draws only the focus countries (clean silhouette); default `"context"` shows neighbors.
- After a map, any element can sit on the map with `"pos": {"geo": [lon, lat]}`, and arrows/paths accept geo
  points: `"from": {"geo": [41.6, 40.6]}`. Use `"map": "<id>"` inside the geo object if a scene has two maps.
- Country names follow Natural Earth (`vox countries`): "United States of America", "Turkey", "Iran", ...

## Styles (themes)

A theme restyles the **whole** story: fonts, a color remap applied to every component, paper treatment (torn vs
clean-cut edges, soft/hard/deep shadows, riso misregistration, blueprint outlines), background, headline and
caption treatment, and auto-placed decorations. The same story renders in any theme with `--theme <name>`.

| theme | look | headline | caption |
|---|---|---|---|
| `vox-news` | bold flat color per scene, torn chips | torn chip | torn strip, yellow marker |
| `scrapbook` | cream grid paper, scene-colored circle + torn strip, triangles/zigzags/tape | taped label | taped strip |
| `protest` | blue duotone newsprint, red/yellow accents, hand-lettered labels | taped label | red invert highlight |
| `papercraft` | cream fiber paper, clean-cut layered paper, deep shadows, muted colors | display serif, no chip | underline |
| `noir` | B&W newsprint, heavy grain, single red accent | torn chip, Bebas | typewriter, invert |
| `riso` | off-white paper, pink/blue/yellow inks, off-register overprint, blob accents | riso overprint | pink marker |
| `blueprint` | blue grid, white outlines, monospace, FIG. labels | outlined box | outlined box |
| `retro70s` | rotating sunburst, 70s palette, hard offset shadows | rounded pill, Shrikhand | pill |
| `swiss` | crisp cut paper, flat color, red accents, minimal texture | red block | red invert |

Notes:
- In paper-base themes (scrapbook, papercraft, riso, blueprint) the scene `bg` becomes an accent (circle, blob)
  and maps without a `card` automatically get a water card in the scene color.
- Colors can be palette tokens: `"color": "$accent"`, `"$accent2"`, `"$red"`, `"$ink"`, `"$paper"`, `"$pink"`.
- Per-scene: `"accent": "none" | "circle" | "strip" | "both" | "blob"`, `"decor": false`.
- `themeOverrides` deep-merges into the theme (fonts, caption, headline, paperStyle, background...).

## Quality and formats

- `format`: `9:16` (1080x1920), `16:9` (1920x1080), `1:1`, `4:5`. Coordinates are in that canvas.
  Captions and headlines size and place themselves for the format (captions sit lower on 16:9).
- `quality` / `--quality`: `draft` (half size, fast), `standard`, `high` (default: every frame drawn at 1.5x
  and Lanczos-downscaled, x264 CRF 16 tuned for animation), `max` (2x supersampling, CRF 13).
- `resolution` / `--resolution`: `1440p` or `4k` scale the output (a 16:9 story at `4k` = 3840x2160).

## Languages

Set `"lang"`. Bangla (`bn`) uses Hind Siliguri with correct conjuncts and native digits in `counter`.
Other scripts fall back to system fonts (Nirmala UI on Windows covers most Indic scripts). Add your own fonts
with `"fontDirs": ["fonts"]` and theme overrides:
`"themeOverrides": {"fonts": {"headline": {"family": "My Font"}}}`.

## Sound

`"audio": {"sfx": true}` synthesizes paper foley from the timeline: pops on `pop`, whooshes on slides and
transitions, thuds on shakes/headlines, stamp hits, paper rustle on captions. `"music": "bed.mp3"` mixes a
track underneath (fades out at the end). No audio unless you ask for it.

## CLI

```
vox check  story.json            # validate + timeline
vox stills story.json            # contact sheet PNG (review the look in seconds)
vox stills story.json --scene 3 --times 0.1,0.4,0.8   # one scene's animation
vox frame  story.json 12.5       # one full-res frame
vox render story.json [--theme T] [--quality high] [--resolution 4k] [--sfx] [-o out.mp4]
vox gallery story.json --scenes 1,3        # the same shots in all 9 themes, side by side
```

## Example stories (one per theme)

`stories/` has a complete, reviewed story for every theme: `iron-gate.*` (vox-news, EN/BN/16:9),
`coffee.scrapbook`, `four-day-week.protest`, `bread.papercraft`, `db-cooper.noir`, `rubiks-cube.riso`,
`padma-bridge.blueprint.bn` (Bangla), `apollo-11.retro70s`, `seasons.swiss.landscape` (16:9).
