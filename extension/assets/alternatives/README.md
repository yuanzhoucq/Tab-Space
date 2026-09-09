# Toolbar icon alternatives

Drafts that were built and compared before `../toolbar.svg` was chosen. They are
kept because the choice between them is a matter of taste, not correctness — all
four render correctly and none is a discard.

**None of these is used by the build.** `build.mjs` reads `../toolbar.svg` for
Chrome and Edge, and `../toolbar-firefox-*.png` for Firefox. Swapping one in
means rendering it over `../toolbar-{16,32,48,128}.png`; the command is in
`../../README.md`.

| File | What it is | Cost |
| --- | --- | --- |
| `monoline-grey.svg` | The shipped drawing in `#8D8D8D` instead of the accent blue. Identical geometry, so it is a drop-in swap. | The best a single neutral can manage is 3.32:1 on each of Chrome's two toolbars — the blue reaches 4.02:1 on the light one and separates from grey by hue on the dark one. |
| `two-tone-stroke.svg` + `two-tone-stroke-16.svg` | Every line 2 units wide, ink inside and paper outside, so each theme swallows one half. The most robust: it never asks one colour to work on both backgrounds. | Every path is drawn twice, masks are per-layer, and 16px needs the separate companion glyph. |
| `logo-blocks.svg` | The app icon's two blocks. Strongest brand recognition, and the only one whose shape is identical on every background. | Colour-heavy next to the line-art icons of neighbouring extensions, and at 16px the arrows inside the blocks do not resolve. |

Scope: the icons here and in the parent folder are for the **Chrome and Edge**
toolbar button only. Firefox resolves the theme correctly on its own through
`theme_icons` and keeps its original dark/light pair; nothing here is used
anywhere else in the product either.

## Measured background colours

Every contrast figure above and in the SVG comments is against toolbar colours
sampled from real browser windows, not assumed:

| | |
| --- | --- |
| Chrome light toolbar | `#FFFFFF` |
| Chrome dark toolbar | `#3C3C3C` |
| Chrome tab strip | `#1F2020` |
| Edge dark toolbar | `#333333` |

Chrome on macOS follows the system appearance and ignores its own
`user_color_scheme` preference, so the dark values were read off an incognito
window, which renders the dark UI even on a light system.
