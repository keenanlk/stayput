# Stayput

**Your files stay put.** Free file tools that run entirely in your browser. Nothing is uploaded, nothing is capped, nothing is watermarked, and it works offline.

Live site: https://stayput.app (once deployed)

## Tools

| Images | PDFs |
| --- | --- |
| [HEIC to JPG or PNG](https://stayput.app/tools/heic-to-jpg) | [Merge PDF](https://stayput.app/tools/merge-pdf) |
| [Convert images](https://stayput.app/tools/convert-image) (PNG, JPG, WebP, AVIF, HEIC, SVG in; JPG, PNG, WebP out) | [Split PDF / extract pages](https://stayput.app/tools/split-pdf) |
| [Compress and resize images](https://stayput.app/tools/compress-image) | [Compress PDF](https://stayput.app/tools/compress-pdf) (lossless cleanup, image recompression, or flatten) |
| [Remove EXIF and GPS data](https://stayput.app/tools/strip-exif) (lossless) | [Rotate PDF pages](https://stayput.app/tools/rotate-pdf) |
| | [Images to PDF](https://stayput.app/tools/image-to-pdf) |
| | [PDF to images](https://stayput.app/tools/pdf-to-image) |

## How it works

The site is static HTML, CSS and JavaScript. Every tool does its work inside the browser tab:

- **HEIC decoding**: [heic-to](https://github.com/hoppergee/heic-to), a WebAssembly build of libheif, loaded on demand from jsDelivr. The request fetches only the decoder; no image data is sent.
- **PDF editing**: [pdf-lib](https://pdf-lib.js.org) for merge, split, rotate, image embedding and rewriting image streams.
- **PDF rendering**: [pdf.js](https://mozilla.github.io/pdf.js/) (legacy build for wide browser support) on a dedicated web worker.
- **Image resize and encode**: the canvas API, with stepped downscaling for sharp results.
- **EXIF removal**: a hand-written, lossless segment/chunk editor for JPEG, PNG and WebP in `src/lib/exif.ts`. It also extracts EXIF from HEIC containers so "keep metadata" works on HEIC conversions.
- **Offline**: a service worker generated at build time (`src/pages/sw.js.ts`) caches every tool page and the hashed assets.

There is no backend, no analytics and no cookies. See `/privacy` for the full statement.

## Development

Requirements: Node 22+.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
node scripts/serve.mjs   # serve dist/ locally with Vercel-style clean URLs
```

### Tests

End-to-end tests drive every tool in headless Chromium with generated fixtures (JPEG with EXIF and GPS, PNG, WebP, HEIC, multi-page PDFs).

```bash
pip install pillow pillow-heif            # once, for fixture generation
python3 tests/fixtures/make-fixtures.py && node tests/fixtures/make-pdf.mjs
npx playwright install chromium           # once
npm run build && npm test
```

Set `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome` to use a preinstalled browser.

## Deploying to Vercel

The site is a plain static export, so the Hobby plan is enough.

1. Push this repository to GitHub (already done if you are reading this there).
2. In Vercel, **Add New Project**, import `keenanlk/stayput`. Vercel detects Astro automatically: build command `npm run build`, output directory `dist`. No environment variables are needed.
3. Deploy. The included `vercel.json` sets clean URLs, long-lived caching for hashed assets, and security headers including a strict Content-Security-Policy.
4. Add the custom domain under **Settings, Domains** and point DNS at Vercel. If the domain is not `stayput.app`, change `site` in `astro.config.mjs` and the `Sitemap:` line in `public/robots.txt`, then redeploy.

Every push to `main` redeploys. Pull requests get preview URLs.

## Adding a tool

1. Add an entry to `src/data/tools.ts` (slug, SEO copy, FAQ). This feeds the home page, footer, sitemap, service worker and structured data.
2. Create `src/pages/tools/<slug>.astro` using `ToolLayout` and put the option controls in the `options` slot.
3. Create `src/tools/<slug>.ts`, call `createShell({ process })` from `src/lib/shell.ts`, and return the output files.
4. Add a test to `tests/tools.spec.ts`.

## License

MIT. See `LICENSE`. Third-party libraries keep their own licenses: heic-to (LGPL-3.0, loaded as a separate module at runtime), pdf-lib (MIT), pdf.js (Apache-2.0), fflate (MIT), Astro (MIT).
