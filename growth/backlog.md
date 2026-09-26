# Growth backlog

Ranked list of what to build next, one tool or a batch of pages per week. Re-rank
each week from Umami (which pages get traffic, which tools get runs) and Search
Console once it is connected. Demand figures are rough monthly global search
volumes from public keyword-tool snapshots (September 2026) and are there for
ordering, not precision. "Fit" is how well the job suits browser-only processing.

Shipped so far: 15 tools, 17 format-pair pages, 14 preset landing pages, 10 guides.

Search-gap batch E3 (2026-09-26): `/delete-pdf-pages`, `/jfif-to-jpg`, `/jfif-to-png`, `/svg-to-jpg`, `/gif-to-png`, `/gif-to-jpg`. Ubersuggest US volumes/difficulty at the time: remove/delete pages from PDF 27.1k each (SD 38-41; "...document" SD 23), JFIF to JPG 12.1k (SD 17), GIF to PNG 8.1k (SD 31), JFIF to PNG 6.6k (SD 15), SVG to JPG 6.6k (SD 27), GIF to JPG 2.9k (SD 31). Read with E3 in stayput-ops.

## Next ten, in order

| # | Item | Kind | Demand signal | Fit | Notes |
|---|------|------|---------------|-----|-------|
| 1 | **Crop image** (`/tools/crop-image`, plus `/crop-image-to-circle`, `/crop-image-to-square` presets) | tool | "crop image" ~1M, "circle crop" ~200k | High | Canvas crop with drag handles and aspect presets (1:1, 4:5, 16:9, passport sizes). Pairs naturally with Resize. Biggest missing image job. |
| 2 | **Password-protect PDF** (`/tools/protect-pdf`) | tool | "protect pdf" ~200k, "password protect pdf" ~150k | Medium | pdf-lib has no encryption; implement the standard security handler (AES-256, R6) with WebCrypto on top of pdf-lib's writer. The privacy angle is strong: nobody should upload a file they are about to password-protect. |
| 3 | **Unlock PDF** (`/tools/unlock-pdf`) | tool | "unlock pdf" ~500k, "remove password from pdf" ~250k | Medium | pdf.js decrypts with the user password; re-save via pdf-lib needs a decrypt pass of the object streams. Do together with #2, since both need the crypto code. Only for PDFs whose password you know; say so. |
| 4 | **PDF watermark** (`/tools/watermark-pdf`) | tool | "watermark pdf" ~100k, "add watermark to pdf" ~60k | High | Text or image stamp, opacity, angle, every page. Small extension of the Sign PDF placement code. |
| 5 | **Guides batch 2** | pages | long tail | High | "how to split a PDF into separate pages", "how to reduce PDF size on iPhone/Mac", "PDF to Word without losing formatting (what is possible)", "how to combine photos into one PDF on iPhone", "convert WebP to JPG on Windows/Mac", "is it safe to sign a PDF online". Each links to an existing tool. |
| 6 | **Image to text (OCR)** (`/tools/image-to-text`, and OCR for PDF to Word scans) | tool | "image to text" ~1.5M, "ocr online" ~300k | Medium | Tesseract.js self-hosted under /vendor/ like the other Wasm codecs (~10 MB of traineddata per language, cached). Slow on phones; fine on laptops. Unlocks scanned PDFs, the top complaint on PDF to Word. |
| 7 | **Compress PNG / Compress WebP presets** and **/convert-to-webp** | pages | "compress png" ~300k, "png compressor" ~100k, "convert to webp" ~150k | High | Presets of compress-image and convert-image; copy about lossless vs palette quantisation. Consider a palette quantiser (pngquant-style in JS) for real PNG size wins. |
| 8 | **Video to GIF** (`/tools/video-to-gif`) | tool | "video to gif" ~800k, "mp4 to gif" ~500k | Medium | Decode with the browser's video element to canvas frames, encode GIF in a worker (gifenc). Short clips only; say so. Large audience, strong "no upload" angle for personal videos. |
| 9 | **Bulk rename files** (`/tools/rename-files`) | tool | "bulk rename" ~100k, "batch rename files online" ~20k | High | Pattern, numbering, find and replace, date from EXIF; download as zip. Cheap to build, unusual for a website, good for a Show HN comment. |
| 10 | **Flip and rotate image**, **PDF to PDF/A-ish flatten**, **Excel/CSV to PDF** | tools | "rotate image" ~400k, "flip image" ~150k | High / Low / Low | Rotate/flip is trivial on canvas and a common search; ship as a small tool with presets. The other two are lower fit and lower demand; keep for later. |

## Also on the list (unranked)

- Format pairs not yet covered: `bmp-to-jpg` / `bmp-to-png` (browser decodes BMP natively, no new code; US ~0.9k and ~1k, SD ~30, add if E3 pairs earn impressions), `tiff-to-jpg` (needs a TIFF decoder; UTIF.js), `heic-to-webp`, `png-to-ico` (favicon generator, "favicon generator" ~300k, high fit).
- Needs new tool code (from the E3 research): **GIF frame splitter** ("animated gif to png" 8.1k US, SD 55; "gif to png frames/sequence" ~0.5k): export every frame as PNG in a zip, needs a GIF frame decoder (ImageDecoder API where available, else gifuct-js). **Target file size** for compress image and compress PDF ("compress pdf to 1mb" 480, "compress image to 100kb" 210 US, but far larger in India): binary-search the quality until the output is under a chosen size. Both stay on hold with the other new tools.
- Guide candidates from the E3 research: "convert HEIC to JPG on Mac" ("how to convert heic to jpg on macbook air" 2.9k, SD 9; Preview and Photos export, and our page for batches).
- PDF: delete pages preset of reorder (`/delete-pdf-pages` exists as a redirect; make it a page), `/pdf-to-jpg-high-quality`, PDF metadata viewer and remover (title/author/producer, high privacy angle, small).
- Images: EXIF viewer as its own page (`/exif-viewer`, "exif viewer" ~100k) reusing the strip-exif report panel; "remove background" is in demand (~2M) but needs a segmentation model, out of scope for now.
- Site pages from the marketing plan: `/changelog` rendered from CHANGELOG.md, `/press` rendered from launch/press-kit.md, an IndexNow key file in `public/`, `public/.well-known/atproto-did` once Keenan pastes the Bluesky DID, hello@stayput.dev and the Bluesky handle in the footer, and the 20-second demo video (WebM via Playwright) embedded under the home hero.
- Guides: "what does a PDF know about you (metadata)", "why free online tools ask for your email", "how to send large photos without losing quality".

## How to pick

1. Take the top item whose fit is High unless something above it has been unblocked.
2. Check Umami for the last week: if an existing tool's landing pages get traffic but few runs, fix that page before building new things.
3. One PR per tool, following the README "Adding a tool" steps, with the no-bytes-leave test. One PR per batch of pages.
4. Update this file in the same PR: remove what shipped, re-rank the rest, add what the week's research surfaced.
