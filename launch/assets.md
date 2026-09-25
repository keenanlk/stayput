# Launch assets (pending)

These wait until the site is live on stayput.app, because they should show the
real domain in the address bar and the real network tab. Claude makes them
with headless Chromium from the live site once the Vercel import is done.

## GIF: "the network tab stays empty"

- 15 seconds, 1270 by 760, light theme, under 8 MB (Product Hunt limit), also exported as MP4 for the README and Reddit.
- Frame: the HEIC to JPG tool page with DevTools open on the right, Network tab selected, filter cleared.
- Sequence: drop ten HEIC photos; the tool's own request panel shows the count; the Network tab shows the one-time decoder fetch (or nothing, if cached) and no request with a body; the progress runs; the zip downloads.
- Overlay text at the end, two seconds, in Familjen Grotesk: "Open the network tab. It stays empty."
- Loops cleanly.

## Screenshots (five, 1270 by 760, light theme)

1. Home page above the fold: the hook line, the four promises, the tool grid.
2. The tool shell on merge-pdf with three files loaded and the download button ready.
3. Sign PDF: a drawn signature placed on a page in the preview.
4. Strip EXIF result panel: before and after sizes, "pixels identical", the removed fields listed.
5. Offline: the site loaded with the browser's offline indicator visible, or the PWA install prompt.
6. (Alternate) The public Umami share page, cropped to the top cards.

## Also produced from the live site

- README GIF (same as above, MP4 embedded as a GIF fallback).
- OG images already exist in `public/og/`; re-run `node scripts/make-og.mjs` after any copy change.
- A 1200 by 630 launch card for Reddit link posts: the pin mark, the hook line, stayput.app.

## Tooling

Playwright with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` in the
cloud sandbox for screenshots; `page.video` for the raw capture, ffmpeg for the
GIF and MP4. A `scripts/make-launch-assets.mjs` will be added with the assets.
