# Mathews Joy — personal site

Static, single-page portfolio with a full-viewport hero: dark photography, sharp film-style grain overlay, and minimal type (layout inspired by the [Freddie](https://wordpress.com/theme/freddie?tab_filter=recommended) WordPress theme—not a copy of its assets).

## Swap the hero image

Replace `[assets/hero.jpg](assets/hero.jpg)` with your own photo (same path and name, or update `--hero-img` in `[css/styles.css](css/styles.css)` and the `src` on the `<img>` in `[index.html](index.html)` if you use a different filename).

The base gradient behind the stack in `.hero__visual` stays visible if the image is slow to load; use a dark, high-contrast shot for the closest match to the reference look.

**Hero photo:** `hero.jpg` is a minimal dark green Jaguar E-Type shot by [Hunter Scott](https://unsplash.com/@huntercreatesthings) on [Unsplash](https://unsplash.com/photos/a-classic-dark-green-jaguar-e-type-car-L2PpmkMQYww) (free under the [Unsplash License](https://unsplash.com/license)). Swap the file anytime for your own image.

## Preview locally

- **Direct:** open `index.html` in a browser (double-click or drag onto a tab).
- **Local server (optional):** from this folder run `npx --yes serve` or `python -m http.server 8080`, then open the URL shown.

## Deploy

Upload the folder to any static host:

- [Netlify Drop](https://app.netlify.com/drop) or Git-connected Netlify
- [Cloudflare Pages](https://pages.cloudflare.com/)
- [GitHub Pages](https://pages.github.com/) (publish the repo root or a `/docs` folder)

No build step is required.

## Files


| Path              | Role                                                   |
| ----------------- | ------------------------------------------------------ |
| `index.html`      | Markup and copy                                        |
| `css/styles.css`  | Layout, effects, breakpoints, `prefers-reduced-motion` |
| `assets/hero.jpg` | Full-bleed background image                            |


