# Changelog

All notable changes to Stayput. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
one entry per merged pull request, newest first. A `/changelog` page on the
site will render this file.

## Unreleased

### Added
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
