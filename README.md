# mathewsjoyy.github.io

My personal site — one static page, nothing fancy. Styled like a two-ink print (after the cover of James Muldoon's *Love Machines*): cream paper, black pixel type, and the hero photo rendered as a live magenta dither. The code and assets here are mine.

## Hero image

Drop your photo in as `assets/hero.jpg`, or change the path in `index.html` if you rename it. Any photo works: `js/dither.js` redraws it in four magenta inks from its brightness alone, so the original colours don't matter.

Tuning lives at the top of `js/dither.js`: `PALETTE` is the ink ramp (darkest first), `GAMMA`/`EXPOSURE` set how much of the image lands on the dark inks, and `FOCUS_Y` picks the vertical crop. Keep `FOCUS_Y` in step with the `object-position` on `.hero__photo` in `css/styles.css`, which frames the no-JS fallback.

## Run it locally

Open `index.html` in a browser, or from this folder:

`npx --yes serve` or `python -m http.server 8080`

## Host it

It’s plain HTML/CSS — drag the folder to [Netlify Drop](https://app.netlify.com/drop), hook the repo to Netlify/Cloudflare, or use [GitHub Pages](https://pages.github.com/) from the repo root (or `/docs` if you prefer). No build.

## What’s where

| File | What it is |
| ---- | ---------- |
| `index.html` | Page + copy |
| `css/styles.css` | Colour tokens, layout, breakpoints, reduced motion |
| `js/dither.js` | Magenta duotone dither + cursor ripples for the hero band |
| `assets/hero.jpg` | Hero background |
| `assets/favicon.svg` | Tab icon (sparkle / star vibe) |

Tool icons live under [`assets/logos/`](assets/logos/) as SVGs (sourced from [Simple Icons](https://simpleicons.org/), CC0) so the page stays **fully static** with no icon CDN. They sit under the bio and are flattened to black ink. Trademarks belong to their owners; replace files or `src` paths in `index.html` if your stack changes.
