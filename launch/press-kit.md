# Press kit

Everything a directory form, a blog post or a journalist needs, in one place.
Copy from here so every description of Stayput says the same thing. A `/press`
page on the site is planned (growth/backlog.md); until then this file is the
kit and the assets are in `launch/assets/`.

## Name and spelling

**Stayput**, one word, capital S. Never "StayPut" or "Stay Put". Tagline:
**Your files stay put.**

## Descriptions

**One line (under 80 characters)**
> Convert HEIC and fix PDFs in your browser. Nothing uploaded.

**Short (160 characters)**
> Free, open-source file tools that run entirely in your browser: HEIC to JPG, PDF merge, split, compress, sign, EXIF removal. Nothing is uploaded. Works offline.

**Paragraph**
> Stayput is a free, open-source toolkit for the file jobs people search for every day: converting HEIC photos, converting and compressing images, removing EXIF and GPS data, and merging, splitting, compressing, rotating, reordering, signing and numbering PDFs. Every tool runs inside the browser tab. There is no server, so nothing is uploaded, there are no accounts, no file limits and no watermarks, and the site keeps working with the network off. The code is MIT on GitHub and the usage statistics are public.

## Facts

| | |
| --- | --- |
| Site | https://stayput.dev |
| Code | https://github.com/keenanlk/stayput (MIT) |
| Public usage stats | https://stats.keenankaufman.com/share/878bb036d828/Stayput |
| Contact | hello@stayput.dev |
| Profiles | Reserved, not posted to: [Facebook](https://www.facebook.com/profile.php?id=61594601468983), [Instagram](https://www.instagram.com/stayputdev/), [X](https://x.com/stayputdev), [YouTube](https://www.youtube.com/@stayputdev). Updates go out on Bluesky @stayput.dev |
| Maker | Keenan Kaufman, solo |
| Launched | October 2026 |
| Tools | 14: HEIC to JPG, convert image (JPG, PNG, WebP, AVIF, JPEG XL), compress image, strip EXIF, merge PDF, split PDF, compress PDF, rotate PDF, reorder and delete pages, sign PDF, add page numbers, images to PDF, PDF to images, PDF to Word/text |
| Price | Free, no accounts, no ads, no paid tier. Runs on a static host; the only cost is the domain. |
| Works offline | Yes, after the first visit (service worker, installable as a PWA) |
| Stack | Astro static site, TypeScript, pdf-lib, pdf.js, libheif and jSquash codecs compiled to WebAssembly, canvas, fflate |
| Analytics | Self-hosted Umami: cookieless, no IP stored, honours Do Not Track, numbers public |

## How to verify that nothing is uploaded

Three ways, in the order a sceptical reader tries them:

1. Open the browser's developer tools on the Network tab, drop a file into any tool, and watch: the only requests are the page load, the on-demand codec download on HEIC, AVIF and JPEG XL pages, and one anonymous page count. Nothing carries the file. Every tool page also counts its own requests after files are added and shows the list.
2. Turn on airplane mode after the page has loaded and keep using the tool.
3. Read the Content-Security-Policy in `vercel.json`: `connect-src` allows only the site itself and the stats host, so a bug could not send a file anywhere else even if it tried. The Playwright tests assert that no request carries a body after files are added.

## Assets

All in `launch/assets/`. Regenerate with `npm run launch-assets` (see assets.md).

| File | What it shows | Use |
| --- | --- | --- |
| network-tab.gif (1270x760) | Three HEIC files converting while the network tab stays at the page load | Social posts, README, press |
| 01-home.png | Home page, tool grid | Directory galleries |
| 02-merge-pdf.png | Merge PDF with pages ready to download | Product Hunt gallery 1 |
| 03-sign-pdf.png | Sign PDF with a drawn signature placed | Product Hunt gallery 2 |
| 04-strip-exif.png | EXIF report before and after | Product Hunt gallery 3, DEV.to |
| 05-network-proof.png | The request panel on a tool page showing zero uploads | Show HN, Reddit |
| 06-install-prompt.png | Install as an app | Product Hunt gallery 4 |
| public/icons/icon-512.png | Pin mark on green, 512x512 | Logo for every directory |
| public/og.png | 1200x630 share card | GitHub social preview, link previews |

Brand: green `#1F6F50` (dark mode `#5CC498`), ground `#F3F6F4`, ink
`#1B241F`. Type: Familjen Grotesk for headings, Source Sans 3 for text.

## Quotes that can be attributed to Keenan

> A browser can decode HEIC, rewrite a PDF and re-encode a JPEG on its own. The upload step on every other site is there for the site, not for you.

> Open the network tab. It stays empty.

## What Stayput does not do

No OCR, no video, no Office formats yet. Say so when asked; the honest limits
are part of the pitch.
