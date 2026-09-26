# Show HN

Post on **Tuesday, October 27, 2026, at 9:00 am Eastern** from Keenan's HN
account. Show HN rules: the title starts with "Show HN:", the URL is the site,
and the text field holds the first comment (HN lets Show HN posts carry text).
Titles are cut at 80 characters.

## Title

Use the first one. The others are fallbacks if a moderator or a dead post
calls for a second attempt after a meaningful update (HN allows one honest
re-submission).

1. `Show HN: Stayput – Convert HEIC and edit PDFs in your browser, nothing uploaded`
2. `Show HN: Stayput – Free HEIC and PDF tools that never upload your files`
3. `Show HN: Open-source file tools where the network tab stays empty`

URL: `https://stayput.dev`

## First comment (goes in the text field)

> I built Stayput because every "convert HEIC to JPG" or "compress PDF" site I found wanted the file uploaded first, then capped me at three files a day or put a watermark on the result. None of that is needed. A browser can decode HEIC, rewrite a PDF and re-encode a JPEG on its own.
>
> So Stayput is a static site. There is no backend. Thirteen tools (HEIC to JPG, image convert, compress, EXIF strip, PDF merge, split, compress, rotate, reorder, sign, page numbers, images to PDF, PDF to images), all running in the tab. Open the network tab, drop a file, and watch: nothing carrying the file ever leaves. Each tool page also counts its own requests after you add files and shows you the list.
>
> How it works: libheif compiled to WebAssembly for HEIC (loaded from jsDelivr on demand, cached by a service worker), pdf-lib for PDF editing, pdf.js for rendering, the canvas for image encoding, and jSquash's libjxl and libavif builds for JPEG XL and AVIF where the browser has no native decoder. The EXIF stripper is hand-written: it walks the JPEG, PNG or WebP container and removes only the metadata segments, so the pixels are untouched and the output is byte-for-byte the same image, just smaller. The site works offline after one visit and installs as a PWA.
>
> Honest limits: no OCR, no video, no Office formats, because each needs a 25 MB+ Wasm download or a library that is not reliable yet. Large batches on iOS Safari are constrained by its memory limits, so files are processed one at a time and buffers are released between them. HEIC decoding is slower than a native app on a phone.
>
> It is MIT licensed, and the analytics (self-hosted Umami, cookieless, coarse buckets only, honours Do Not Track) are public: [stats link]. The whole thing costs the domain to run, so there are no ads, no accounts and no paid tier, and there will not be. Happy to answer anything about the Wasm choices, the CSP, or why lossless EXIF removal is harder than it sounds.
>
> Code: https://github.com/keenanlk/stayput

Replace `[stats link]` with https://stats.keenankaufman.com/share/878bb036d828/Stayput
(or the stayput.dev alias if one exists by then).

## Reply bank

Short answers to the questions HN reliably asks. Post them as replies in
Keenan's voice; each one fits in a single comment.

**"How do I know it does not phone home later?"**
> The Content-Security-Policy in vercel.json limits connect-src to the site itself, jsDelivr and the stats host. A bug could not send a file anywhere else even if it tried; the browser would block it. The service worker is generated at build time from the page list and you can read it at /sw.js.

**"Why load Wasm from jsDelivr instead of self-hosting?"**
> Bandwidth. The site is on a free static host with a 100 GB monthly cap. The HEIC decoder is a few MB and is fetched once per device, so pushing it through a CDN that is free for open-source npm packages keeps the site free to run at any traffic level. It is pinned by version and hashed; the request carries no image data.

**"The analytics call is a request. So something does leave."**
> Yes: a page count per view and three small events (visit start, files added, tool run) with the tool name, coarse buckets (file count, size, duration), the page you came from on the site, a named referrer like "google", and days-since-last-visit ranges worked out from a note in your own browser storage. No identifier, no file name, type, hash or content. The full list is on /privacy, the tracker is self-hosted Umami, it sets no cookies, it stores no IP, and the resulting stats are public so you can see exactly what is collected. Do Not Track turns it off.

**"HEVC patents?"**
> libheif is the same decoder Linux desktops ship. Stayput is non-commercial and open source and loads the library as a separate module at runtime, the same footing as heic2any and dozens of others. On Safari the browser's own decoder is used.

**"Why not Squoosh / Photopea / ilovepdf?"**
> Squoosh is great and I use jSquash's builds of its codecs. It does one image at a time and has no HEIC or PDF. Photopea is an editor. The PDF sites upload. Stayput is the batch-and-PDF gap between them, plus the promise that no file ever leaves.

**"Does it work on a phone?"**
> Yes, and that is where HEIC matters most. Everything runs one file at a time to stay inside Safari's memory limits. A hundred photos convert in about the time the first one would take to upload.

**"Can I self-host it?"**
> Yes. `npm run build` gives you a folder of static files. Headers for Cloudflare Pages are included, and Vercel's config is in the repo.

**"What about OCR / video / DOCX?"**
> Not yet, and I would rather say so than ship something that fails on a phone. Tesseract in Wasm is 25 MB+; WebCodecs video is close and is on the list. New tool every week or so; the keyword list decides which.

**"Why the name?"**
> Your files stay put.

## Etiquette

- Do not ask anyone to upvote; HN detects and penalises it.
- Reply to every top-level comment within the first two hours, briefly.
- Bugs reported in the thread get a reply with a fix ETA and a same-day deploy.
- If the post dies, do not repost the same day. One re-submission after a real update is allowed.
