# Labyrispace brand drafts (Phase 0)

Status: candidates for owner selection. Nothing here is wired into the application, installer, or packaging.

Concept: a circular labyrinth with a cob of corn exiting the center goal at an angled, unicorn-horn angle.

## Candidates

| File | Role | Palette |
|---|---|---|
| `candidate-a-full.svg` | Splash, about page, installer art. Four thin rings, kernel pattern, husk. | bg `#101521`, rings `#4fd1c5`/`#2f9e98`, cob `#f6c343`/`#c98a14`, husk `#6abf69`/`#4da34f` |
| `candidate-a-compact.svg` | Taskbar, tray, small `.ico` sizes. Two rings, flat cob. | same as A |
| `candidate-b-full.svg` | Bold variant: three thick rings, larger cob. | bg `#1a1033`, rings `#b794f6`/`#8a63d2`, cob `#ffb703`/`#e07a00`, husk `#52c37a`/`#3a9f5e` |
| `candidate-b-compact.svg` | Compact form of B. | same as B |
| `generic-site.svg` | Fallback suggestion icon (teal, matches A; recolor if B is chosen). | |
| `preview.html` | Side-by-side sheet at 256/48/32/16 px. Serve over HTTP to view. | |

## Selection

Owner selected **candidate B**. Revision: the middle ring (full mark) and inner ring (compact mark) were rotated 90 degrees clockwise so their openings move from under the cob to the lower right and stay visible. The outer ring was then also rotated 90 degrees clockwise, moving its opening from the lower left to the upper left. Candidate A files are retained for reference only.

## Review notes

- At 256 px the labyrinth reads as concentric rings with offset gaps; the angled cob reads clearly. At 16 px only the cob and one ring survive, so use compact marks below 48 px.
- The rings can read as a radar or target. Short radial walls between rings would make it read more as a maze, at some cost to small-size legibility. Not applied; owner decision.
- Cob direction is -45 degrees (up-right) in both candidates and passes over the rings with a background-coloured outline.

## Still needed after selection

- Multi-resolution `.ico` (16, 24, 32, 48, 64, 128, 256) and runtime PNGs generated from the chosen compact/full SVGs. No rasterizer is installed in this repo; choose a tool before generation.
- Installer artwork (NSIS/MSI banner and sidebar) from the full mark.
- Curated suggestion icon list: owner picks sites; until then only `generic-site.svg` is specified.
- Name styling and optional tagline.

No `.icns` or Linux icons: Windows-first, other platforms left in place and untested.
