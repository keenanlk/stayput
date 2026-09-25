# Community posts

Spread over **Tuesday, November 3 to Saturday, November 7, 2026**, after the
Product Hunt launch. One post per community, written for that community, never
the same text twice. All from Keenan's accounts; Claude drafts and, where
Keenan pastes replies into the thread, drafts those too.

## Reddit

Each subreddit has its own rules on self-promotion. Check the sidebar on the
day; the drafts below are written to fit the rules as of writing. Flair as the
subreddit asks. Never post the same day in two subreddits whose readers
overlap (r/privacy and r/degoogle: three days apart).

### r/degoogle (Tue Nov 3)

Title: `I built an open-source replacement for the "convert HEIC" and "compress PDF" sites that upload your files`

> The HEIC-to-JPG and PDF-compress sites that come up first in search all work the same way: upload, wait, download from a page full of ads, and hit a daily limit. The upload is the part I object to. A browser can do all of this itself.
>
> Stayput (https://stayput.dev) is a static site with no backend. Thirteen tools run in your tab: HEIC to JPG, image convert and compress, EXIF/GPS removal, and PDF merge, split, compress, rotate, reorder, sign, page numbers, images to PDF, PDF to images. It works offline after one visit.
>
> You can check the claim: open the network tab and watch it stay empty, or turn on airplane mode and keep using it. The code is MIT (https://github.com/keenanlk/stayput). The analytics are a self-hosted, cookieless Umami counter, and the numbers are public, so you can see everything that is collected.
>
> Limits: no OCR, no video, no DOCX. Feedback welcome, especially anything that breaks on your phone.

### r/privacy (Fri Nov 6)

Title: `Open-source, browser-only tools for HEIC, PDF and EXIF removal. Nothing leaves your device.`

> Posting because "remove EXIF data online" is a search where the top results ask you to upload the photo whose location you want to remove. That is the wrong way round.
>
> Stayput strips EXIF, XMP, ICC and IPTC from JPG, PNG and WebP losslessly, in the tab: it rewrites only the metadata segments, so the pixels are byte-identical and the file gets smaller. Same idea for HEIC conversion and a full set of PDF tools. No server exists; the site is static and works offline.
>
> Verification: network tab, airplane mode, or read the code (MIT, https://github.com/keenanlk/stayput). The only requests after page load are one anonymous page count to a self-hosted Umami instance (no cookies, no IP stored, honours Do Not Track, stats are public) and the one-time fetch of the HEIC decoder from jsDelivr on the HEIC pages. The CSP in the repo blocks connections anywhere else.
>
> https://stayput.dev

### r/webdev Showoff Saturday (Sat Nov 7)

Title: `Showoff Saturday: Stayput, a file toolkit where the network tab stays empty (Astro + Wasm, no backend)`

> Stack: Astro static export, TypeScript, no client framework. pdf-lib for PDF editing, pdf.js on a dedicated worker for rendering, libheif and jSquash's libjxl/libavif compiled to Wasm and loaded from jsDelivr on demand, canvas for encoding, fflate for zips, a build-time service worker for offline. Strict CSP so nothing can connect anywhere but the site, the CDN and the stats host.
>
> The fun part was the EXIF stripper: no library, just walking JPEG segments, PNG chunks and WebP RIFF chunks and dropping the metadata ones. Lossless and about 600 lines.
>
> Every tool page counts its own requests after you add files and shows the list, which turned out to be the most convincing feature.
>
> Live: https://stayput.dev · Code (MIT): https://github.com/keenanlk/stayput · Playwright tests assert that no request carries a body after files are added.

### r/InternetIsBeautiful (Wed Nov 4)

Title: `Stayput: convert HEIC photos and fix PDFs in your browser. Nothing is uploaded, and it works offline.`

Link post to https://stayput.dev. First comment:

> Made this because every "HEIC to JPG" site wanted my photos uploaded first. This one has no server; it is a static site and the work happens in your tab. Open the network tab and watch. Open source, free, no accounts, no limits.

### Helpful answers in existing threads (ongoing, low volume)

For HEIC and PDF questions already asked on r/iphone, r/techsupport, r/mac,
r/windows. One reply per thread, only where a browser tool is the honest best
answer, no more than a few a week. Template:

> If you don't want to install anything or upload the photos: https://stayput.dev/tools/heic-to-jpg does the conversion in the browser (no server; you can watch the network tab). Batch works, and you can keep or drop the EXIF. On a Mac, Preview's Export also works one file at a time.

Always include the non-Stayput option (Preview, Windows HEIF extension,
`sips`, `heif-convert`) so the answer is an answer, not a pitch.

## DEV.to write-up (Wed Oct 28 to Fri Oct 30)

Title: `Stripping EXIF without re-encoding the JPEG, in about 600 lines of TypeScript`

Canonical URL: the Stayput blog if one exists by then, else DEV.to itself.
Tags: `webdev`, `typescript`, `privacy`, `javascript`.

Outline:

1. **The problem.** Every EXIF remover either re-encodes the image (quality loss, bigger file) or uploads it (the location is gone from the file and now on someone's server).
2. **What is actually in the file.** JPEG segments (APP1 for EXIF and XMP, APP2 for ICC, APP13 for IPTC), PNG chunks (eXIf, iTXt, tEXt, zTXt, iCCP), WebP RIFF chunks (EXIF, XMP, ICCP). Diagrams of each container.
3. **The approach.** Read the container, copy every segment through except the metadata ones, fix up sizes where needed (RIFF total size, VP8X flags). Pixels are never touched.
4. **Gotchas.** Orientation lives in EXIF; dropping it can rotate the photo in viewers, so read it first and offer to bake it in. Some PNGs put EXIF in a text chunk. WebP's VP8X header carries capability bits that must be cleared.
5. **Testing.** Playwright drops fixture files with known EXIF and GPS into the page and checks the output with a parser; another test asserts no request carries a body after files are added.
6. **The HEIC twist.** HEIC stores EXIF inside the ISOBMFF container; extracting it lets "keep metadata" survive HEIC-to-JPG conversion.
7. **Code and site.** Link to `src/lib/exif.ts` and to the tool page.

Length: 1,500 to 2,000 words, two diagrams, the code excerpts under 30 lines each. Claude writes it; Keenan publishes.

## Stack Exchange (November onward)

Ask Different, Super User, occasionally Stack Overflow. Only where a
browser-based tool is a legitimate answer to a question already asked, and
always alongside the native way. Disclose authorship every time ("I made
this"). Template:

> Two options that do not need software installed: (1) on macOS, open the HEIC files in Preview, select all, File → Export Selected, choose JPEG; (2) in any browser, https://stayput.dev/tools/heic-to-jpg converts batches locally in the tab, with nothing uploaded (disclosure: I made it, it is open source). Both keep or drop EXIF as you choose.

## Rules for all of the above

- Disclose that Keenan built it, every time.
- No vote requests, no cross-posting the same text, no replies to unrelated threads.
- Reply to every comment for 48 hours; then let it sit.
- Anyone who reports a bug gets a reply when it is fixed, with the commit link.
