# Stayput

**Your files stay put.** Free, open-source tools that convert HEIC photos, merge and compress PDFs, shrink images and strip EXIF data, entirely inside your browser. Nothing is uploaded. There is no server that could receive your files. No accounts, no limits, no watermarks, and it works offline.

Live site: **https://stayput.dev**

## Open the network tab. It stays empty.

That is the whole pitch, and you can check it in three ways:

1. **Watch the network.** Open your browser's developer tools (F12, or Cmd-Option-I on a Mac), pick the Network tab, open any tool and drop a file. You will see requests for the page's own code, once for the HEIC decoder program on the HEIC pages, and one anonymous page count. You will never see a request carrying your file, because there is nowhere for it to go. Every tool page also counts its own requests after you add files and shows you the list.
2. **Turn the network off.** Load a tool, switch to airplane mode, and use it. It keeps working, because after one visit the site is cached by a service worker and the work happens in your tab.
3. **Read the code.** This repository is the site. It builds to static HTML, CSS and JavaScript with no backend; the deploy has no server-side code at all. The [privacy page](https://stayput.dev/privacy) lists every request the site makes and the [usage stats are public](https://stats.keenankaufman.com/share/878bb036d828/Stayput).

## Tools

| Images | PDFs |
| --- | --- |
| [HEIC to JPG or PNG](https://stayput.dev/tools/heic-to-jpg) (batch, keep or drop EXIF) | [Merge PDF](https://stayput.dev/tools/merge-pdf) |
| [Convert images](https://stayput.dev/tools/convert-image) (PNG, JPG, WebP, AVIF, JPEG XL, HEIC, SVG in; JPG, PNG, WebP out) | [Split PDF / extract pages](https://stayput.dev/tools/split-pdf) |
| [Compress and resize images](https://stayput.dev/tools/compress-image) | [Compress PDF](https://stayput.dev/tools/compress-pdf) (lossless cleanup, image recompression, or flatten) |
| [Remove EXIF and GPS data](https://stayput.dev/tools/strip-exif) (lossless, no re-encode) | [Rotate PDF pages](https://stayput.dev/tools/rotate-pdf) |
| | [Images to PDF](https://stayput.dev/tools/image-to-pdf) |
| | [PDF to images](https://stayput.dev/tools/pdf-to-image) |
| | [Reorder and delete pages](https://stayput.dev/tools/reorder-pdf) |
| | [Sign PDF](https://stayput.dev/tools/sign-pdf) (draw or type, place on any page) |
| | [Add page numbers](https://stayput.dev/tools/pdf-page-numbers) |

Plus dedicated pages for the conversions people search for: [HEIC to PNG](https://stayput.dev/heic-to-png), [PNG to JPG](https://stayput.dev/png-to-jpg), [JPG to PNG](https://stayput.dev/jpg-to-png), [WebP to PNG](https://stayput.dev/webp-to-png), [WebP to JPG](https://stayput.dev/webp-to-jpg), [PNG to WebP](https://stayput.dev/png-to-webp), [JPG to WebP](https://stayput.dev/jpg-to-webp), [AVIF to JPG](https://stayput.dev/avif-to-jpg), [AVIF to PNG](https://stayput.dev/avif-to-png), [SVG to PNG](https://stayput.dev/svg-to-png).

## How it works

The site is a static [Astro](https://astro.build) build: one page per tool, a shared tool shell, and a TypeScript module per tool that does the work in the tab.

- **HEIC decoding**: [heic-to](https://github.com/hoppergee/heic-to), a WebAssembly build of libheif, loaded on demand from jsDelivr. The request fetches only the decoder; no image data is sent.
- **PDF editing**: [pdf-lib](https://pdf-lib.js.org) for merge, split, rotate, reorder, page numbers (standard fonts, nothing embedded), signature stamps, image embedding and rewriting image streams.
- **PDF rendering**: [pdf.js](https://mozilla.github.io/pdf.js/) (legacy build for wide browser support) on a dedicated web worker.
- **Image resize and encode**: the canvas API, with stepped downscaling for sharp results.
- **JPEG XL and AVIF decoding**: the browser's own decoder when it has one (AVIF everywhere, JXL in Safari); otherwise the [jSquash](https://github.com/jamsinclair/jSquash) WebAssembly builds of libjxl and libavif, loaded on demand from jsDelivr like the HEIC decoder.
- **Signatures**: drawn on a canvas with pointer events (pressure-aware for pens) or typed in the self-hosted Caveat font, cropped to a transparent PNG and placed at preview coordinates mapped into PDF user space, page rotation included.
- **EXIF removal**: a hand-written, lossless segment and chunk editor for JPEG, PNG and WebP in `src/lib/exif.ts`. It deletes only the metadata segments and writes the untouched image data back, so the pixels are identical and the file only gets smaller. It also extracts EXIF from HEIC containers so "keep metadata" works on HEIC conversions.
- **Zip downloads**: [fflate](https://github.com/101arrowz/fflate) in the tab when there is more than one output.
- **Offline**: a service worker generated at build time (`src/pages/sw.js.ts`) caches every tool page and the hashed assets. Pages are network-first so deploys show up immediately; assets are cache-first because their names are content-hashed.
- **Security headers**: `vercel.json` ships a strict Content-Security-Policy. Scripts may load only from the site itself, jsDelivr (the decoder) and the self-hosted analytics host. `connect-src` is limited the same way, so even a bug could not send a file elsewhere.
- **Analytics**: a self-hosted, cookie-free [Umami](https://umami.is) counter records page views and tool runs as coarse buckets (tool, outcome, file count bucket, size bucket, duration bucket). Never file names, types or contents. It honours Do Not Track. The dashboard is public.

There is no backend and no cookies. See [`/privacy`](https://stayput.dev/privacy) for the full statement.

## Development

Requirements: Node 22+.

```bash
npm install
npm run dev              # http://localhost:4321
npm run build            # static output in dist/
node scripts/serve.mjs   # serve dist/ locally with Vercel-style clean URLs
npm run check            # Astro and TypeScript checks
```

### Tests

End-to-end tests drive every tool in headless Chromium with generated fixtures (JPEG with EXIF and GPS, PNG, WebP, HEIC, multi-page PDFs), then check the downloaded outputs. One test also asserts the privacy claim directly: after files are added, no request leaves the page except the stubbed analytics call.

```bash
pip install pillow pillow-heif            # once, for fixture generation
python3 tests/fixtures/make-fixtures.py && node tests/fixtures/make-pdf.mjs
npx playwright install chromium           # once
npm run build && npm test
```

Set `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome` to use a preinstalled browser.

### Social images

`public/og.png` and `public/og/<slug>.png` are rendered from the page copy by `node scripts/make-og.mjs` (headless Chromium). Re-run it after changing a tool's heading or tagline and commit the result.

## Deploying

The site is a plain static export, so Vercel's Hobby plan (or any static host) is enough.

1. In Vercel, **Add New Project** and import this repository. Vercel detects Astro: build command `npm run build`, output directory `dist`. No environment variables are needed.
2. Deploy. `vercel.json` sets clean URLs, redirects for the short tool URLs, long-lived caching for hashed assets, and the security headers.
3. Add the custom domain under **Settings, Domains**. If the domain is not `stayput.dev`, change `site` in `astro.config.mjs` and the `Sitemap:` line in `public/robots.txt`, then redeploy.

Every push to `main` redeploys; pull requests get preview URLs. `public/_headers` carries the same headers for Cloudflare Pages, so moving hosts is a DNS change.

## Adding a tool

1. Add an entry to `src/data/tools.ts` (slug, SEO copy, steps, FAQ) and a paragraph to `src/data/engine.ts` saying what actually runs in the tab. These feed the home page, footer, sitemap, service worker, structured data and social image.
2. Create `src/pages/tools/<slug>.astro` using `ToolLayout` and put the option controls in the `options` slot.
3. Create `src/tools/<slug>.ts`, call `createShell({ process })` from `src/lib/shell.ts`, and return the output files.
4. Add a test to `tests/tools.spec.ts`, then run `node scripts/make-og.mjs`.

A format-pair landing page ("WebP to PNG") is just an entry in `src/data/pairs.ts`; the page, its social image and its sitemap entry are generated.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the ground rules, the main one being that no change may make a file leave the browser.

## Support

Stayput is free and will stay free. There are no ads, no accounts and no paid tier. If it saved you a subscription and you want to say thanks, the repository has a GitHub Sponsors link; sponsorship covers the domain and nothing else.

## License

MIT. See `LICENSE`. Third-party libraries keep their own licenses: heic-to (LGPL-3.0, loaded as a separate module at runtime), @jsquash/jxl and @jsquash/avif (Apache-2.0, loaded as separate modules at runtime), pdf-lib (MIT), pdf.js (Apache-2.0), fflate (MIT), Astro (MIT). The Caveat font in `public/fonts` is under the SIL Open Font License 1.1 (see `public/fonts/OFL-Caveat.txt`).
