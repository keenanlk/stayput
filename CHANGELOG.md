# Changelog

All notable changes to Stayput. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
one entry per merged pull request, newest first. A `/changelog` page on the
site will render this file.

## Unreleased

### Added
- JPG to AVIF, PNG to AVIF and AVIF to WebP: new converter pages. AVIF output uses the browser's own encoder where it has one (Safari's engine does) and otherwise the jSquash AVIF encoder (Apache-2.0, libavif and libaom compiled to WebAssembly), which loads only when you convert and can be cancelled. Quality 1 to 100, a faster-encode option and a downscale option; transparency is kept.
- WMA to MP3: converts Windows Media Audio (versions 1 and 2) files to MP3 in the tab, keeping the title and artist. WMA Pro, WMA Lossless and WMA Voice are refused by name. The decoder is built from FFmpeg's libraries (LGPL) with only the ASF demuxer and the two WMA decoders, and loads only when you convert a WMA.
- FLV to MP4: converts FLV files that hold H.264 picture with AAC or MP3 sound in the tab, copying the picture without re-encoding. FLVs with VP6 or Sorenson Spark video get a message naming the codec. The reader is built from FFmpeg's libraries (LGPL) and loads only when you convert an FLV; /licenses links its source and build.
- AVI to MP4: converts Xvid, DivX 4+ and Motion JPEG AVI files in the tab. The decoder is built from FFmpeg's libraries (LGPL) and loads only when you convert an AVI; /licenses links its source and build.
- Search in the header: press / or Ctrl+K (Cmd+K on a Mac), or tap the search icon on a phone, to find any tool, conversion page or guide. Everyday words work ("shrink a PDF", "iPhone photo", "remove password"). Matching happens on the page; nothing you type is sent anywhere.
- The Image Converter detects each file's real format from its bytes (and says when the extension is wrong), has a searchable format picker, and can now save PDF, ICO (favicon sizes 16 to 256), GIF, BMP and TIFF as well as JPG, PNG and WebP.
- This changelog.

### Fixed
- Password-protected and owner-restricted PDFs now open in every PDF tool. They are unlocked in the tab by qpdf (WebAssembly); before, they produced blank or broken output.
- Page numbers and signatures land on the visible page when a PDF's page box does not start at 0,0 or is cropped.
- One unreadable file in a batch is skipped and named instead of failing the whole batch.
- Files that cannot be opened, and empty (0 byte) files, show an error as soon as they are added.
- Every tool works offline after one visit, not only the parts that visit happened to load.
- The HEIC, JPEG XL, AVIF and PDF-unlock WebAssembly programs are served by the site itself instead of the jsDelivr CDN, and image tools cache the decoders they may need, so HEIC, JPEG XL and AVIF conversion works offline too. The CSP no longer allows any CDN.
- Accessibility: the drop zone's accessible name matches its text, and footer links are large enough to tap.

## 2026-09-25

### Added
- PDF to Word/text tool, PDF to text landing page and the growth backlog (#7).
- Ten preset landing pages and ten how-to guides (#6).
- Launch GIF and six screenshots (#4).
- Launch kit drafts: Show HN, Product Hunt, directories, community posts, checklist (#3).
- JPEG XL and AVIF support, Reorder and Delete Pages, Sign PDF, Add Page Numbers (#2).
- Launch polish: request panel on every tool page, install prompt, offline support (#1).
- First release: HEIC to JPG, convert image, compress image, strip EXIF, merge, split, compress, rotate PDF, images to PDF, PDF to images; self-hosted Umami analytics.

### Changed
- Site moved to https://stayput.dev (#5).
