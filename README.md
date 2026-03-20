# mathewsjoyy.github.io

My personal site — one static page, nothing fancy. Big hero image, a bit of grain, simple type. I took cues from the [Freddie](https://wordpress.com/theme/freddie?tab_filter=recommended) theme for the layout; the code and assets here are mine.

## Hero image

Drop your photo in as `assets/hero.jpg`, or change the path in `index.html` and the `--hero-img` variable in `css/styles.css` if you rename it.

There’s a dark gradient behind the image so it doesn’t flash empty while loading — works best with something dark and contrasty.

The current `hero.jpg` is a green Jag on [Unsplash](https://unsplash.com/photos/a-classic-dark-green-jaguar-e-type-car-L2PpmkMQYww) by [Hunter Scott](https://unsplash.com/@huntercreatesthings) ([license](https://unsplash.com/license)). I’ll probably swap it eventually.

## Run it locally

Open `index.html` in a browser, or from this folder:

`npx --yes serve` or `python -m http.server 8080`

## Host it

It’s plain HTML/CSS — drag the folder to [Netlify Drop](https://app.netlify.com/drop), hook the repo to Netlify/Cloudflare, or use [GitHub Pages](https://pages.github.com/) from the repo root (or `/docs` if you prefer). No build.

## What’s where

| File | What it is |
| ---- | ---------- |
| `index.html` | Page + copy |
| `css/styles.css` | Layout, grain, breakpoints, reduced motion |
| `assets/hero.jpg` | Hero background |
