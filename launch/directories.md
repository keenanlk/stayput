# Directory submissions

Submit on **Tuesday, October 27, 2026**, the same day as Show HN, so the
backlinks and the traffic spike land together. Copy is written once in three
lengths and reused everywhere so every listing says the same thing.

## Reusable copy

**One line (under 80 chars)**
> Convert HEIC and fix PDFs in your browser. Nothing uploaded.

**Short (160 chars)**
> Free, open-source file tools that run entirely in your browser: HEIC to JPG, PDF merge, split, compress, sign, EXIF removal. Nothing is uploaded. Works offline.

**Paragraph**
> Stayput is a free, open-source toolkit for the file jobs people search for every day: converting HEIC photos, converting and compressing images, removing EXIF and GPS data, and merging, splitting, compressing, rotating, reordering, signing and numbering PDFs. Every tool runs inside the browser tab. There is no server, so nothing is uploaded, there are no accounts, no file limits and no watermarks, and the site keeps working with the network off. The code is MIT on GitHub and the usage statistics are public.

**Tags**: heic, pdf, privacy, offline, open-source, webassembly, pwa, no-upload, converter, compress

**Category words**: File conversion, PDF tools, Privacy, Productivity, Developer tools

**Logo**: `public/icons/icon-512.png` from the repo (pin mark on green). **Screenshot**: gallery image 2 from assets.md.

## Submissions

| # | Where | Account | Who submits | Exact text and notes |
| --- | --- | --- | --- | --- |
| 1 | **nologin.tools** (github.com/theisensanders-wf/nologin.tools or current maintainer) | GitHub PR | Claude | Add an entry under File tools: `[Stayput](https://stayput.dev) - Convert HEIC, compress and merge PDFs, strip EXIF, all in the browser. Nothing uploaded, works offline.` Follow the repo's line format exactly. |
| 2 | **AlternativeTo** | Keenan's account | Keenan | Name: Stayput. Description: paragraph above. Platforms: Online, Self-Hosted, PWA. License: Free and Open Source (MIT). Alternative to: iLovePDF, Smallpdf, CloudConvert, HEICtoJPG, Squoosh, PDF24 Tools. Tags: heic-converter, pdf-tools, privacy-focused, no-registration, works-offline. |
| 3 | **awesome-privacy** (github.com/pluja/awesome-privacy or the current fork) | GitHub PR | Claude | Under the file tools or utilities section, in the list's format: `- [Stayput](https://stayput.dev) - HEIC, image and PDF tools that run entirely in the browser; nothing is uploaded. Open source (MIT), works offline. [Source](https://github.com/keenanlk/stayput)`. |
| 4 | **awesome-wasm** (github.com/mbasso/awesome-wasm) | GitHub PR | Claude | Under Web frameworks/libraries or Apps: `- [Stayput](https://github.com/keenanlk/stayput) - Browser-only file toolkit using libheif, libjxl and libavif Wasm builds for HEIC, JPEG XL and AVIF decoding; no server.` |
| 5 | **Privacy Guides forum** (discuss.privacyguides.net, Tool Suggestions) | Forum account | Keenan | Title: `Stayput: browser-only HEIC and PDF tools, nothing uploaded (open source)`. Body: paragraph above, then the three ways to verify (network tab, airplane mode, read the code), the public stats link, and the honest limits (no OCR, no video). Ask for feedback, not votes. |
| 6 | **Uneed** (uneed.best) | Uneed account | Keenan | Name: Stayput. Tagline: one line above. Description: paragraph. Category: Productivity or Utilities. Pricing: Free. Schedule for Oct 27. |
| 7 | **Peerlist Launchpad** (peerlist.io/launchpad) | Peerlist account | Keenan | Same fields as Uneed. Launch week of Oct 26. |
| 8 | **Open Source Alternative To** (opensourcealternative.to) | Submission form | Claude (no account) | Name: Stayput. Alternative to: iLovePDF, Smallpdf, CloudConvert. License: MIT. Description: short 160 above. Repo URL. |
| 9 | **AlternativeOSS / OpenAlternative** (openalternative.co) | Submission form | Claude (no account) | Same as 8. |
| 10 | **Product Hunt** | Keenan's account | Keenan | Nov 3. See product-hunt.md. |
| 11 | **Hacker News** | Keenan's account | Keenan | Oct 27. See show-hn.md. |
| 12 | **DEV.to** | Keenan's account | Keenan | Oct 28 to 30. See community.md. |
| 13 | **Astro showcase** (astro.build/showcase, submitted via the Astro Discord or the showcase form) | Form | Claude if no account needed, else Keenan | Stayput, https://stayput.dev, repo link, one line above. |
| 14 | **PWA directories** (appsco.pe or its current successor, progressiveapp.store) | Form | Claude | Name, URL, one line, category Utilities, screenshot. |
| 15 | **Free Software Directory / awesome-selfhosted** | GitHub | Skip for now | Stayput is static and self-hostable but not a "self-hosted service" in their sense. Revisit if a Docker image is ever published. |

Rows 1, 3, 4, 8, 9, 13, 14 need no account from Keenan; Claude submits those
and records each URL in the ops work log under `launch-directories`. Rows 2, 5,
6, 7 need Keenan's accounts; each is one form with the text above pasted in.

## Rules

- One submission per directory. No resubmitting under variations.
- Paste the copy as written. Directories that ask for exclamation marks or superlatives do not get them.
- Where a directory asks for a "launch date", use Oct 27, 2026.
- If a list maintainer asks for changes to a PR, make them the same day.

## Attempt log

**2026-09-26 (moved up from Oct 27 by decision):** tried the 7 no-account
rows (1, 3, 4, 8, 9, 13, 14) from a Claude cloud session. 0 of 7 completed.
Re-checked each one; they split into two different blockers, not the same
one:

- **Needs Keenan's own GitHub account OK before Claude does it** — rows 3
  (awesome-privacy), 4 (awesome-wasm), 13 (Astro showcase), 14 (PWA
  directories). Each is a PR or GitHub Discussion post to someone else's
  repo, which would go out under Keenan's own GitHub identity, and the
  decision card he approved was for anonymous no-account submissions, not
  anything posted as him. Holding these until he says these specific ones
  are OK to post as him (to be asked together with his other account-setup
  items).
- **Genuinely no account needed, but Claude has no way to submit the form
  right now** — rows 1 (nologin.tools), 8 (opensourcealternative.to), 9
  (openalternative.co). All three are plain web forms, no login or PR.
  nologin.tools's own submission page is at nologin.tools/submit, not a
  GitHub PR as first drafted. But: the cloud sandbox's network egress blocks
  all three domains outright, so the forms can't even be loaded from there;
  the Homelab connector only reports on the homelab's containers, hosts and
  services and cannot fetch a URL or fill in a form; and starting a Remote
  Control session on Keenan's device to use a real browser needs a message
  from a person in this thread to anchor it, and this thread has none. So
  these three stay unsubmitted until one of those paths opens up (a person
  asks in this thread so Remote Control can start, or the sandbox's egress
  allowlist covers these domains).

See company/experiments.md in stayput-ops for the fuller note.

**2026-09-26 02:40 UTC, from the homelab (Remote Control, no accounts, no email):**

- Row 1, **nologin.tools**: not listed yet (checked their API). The form at
  nologin.tools/submit needs only the URL, email optional, no captcha. Not
  submitted: the homelab's auto-mode permission check blocked the POST as an
  external write. Keenan can submit it by hand in 10 seconds (paste
  https://stayput.dev, leave email blank), or allow the request next time.
- Row 8, **opensourcealternative.to**: skipped. Email is required, the only
  paths are a paid 48-hour review (+$29) or a 6+ month waitlist, and its
  guidelines want self-hosted projects. Waiting on hello@stayput.dev; even
  then, only the free waitlist.
- Row 9, **openalternative.co**: skipped. /submit redirects to a login page,
  so it needs an account. Waiting on hello@stayput.dev (and an account
  decision).

**2026-09-26 02:36 UTC, Keenan approved "Post as me" for the 4 GitHub-identity
listings (rows 3, 4, 13, 14).** Checked each one's rules first:

- Row 3, **awesome-privacy**: requirements are a clear privacy policy, no
  tracking beyond what the list's Analytics section allows, and open source
  is a plus. Stayput meets all three (no server, no accounts, MIT, no
  tracking). Drafted for the "File Management and Sharing" section, inserted
  alphabetically after Snapdrop, before Winden:
  `- [Stayput](https://stayput.dev) - HEIC, image and PDF tools that run entirely in the browser; nothing is uploaded. Open source (MIT), works offline. [Source](https://github.com/keenanlk/stayput)`
  One-click link (forks and opens the PR editor): https://github.com/pluja/awesome-privacy/edit/main/README.md
- Row 4, **awesome-wasm**: only rule is format and an individual PR per
  suggestion; no star or age minimum. Drafted for the "Others" section under
  Projects, appended after the last entry (ssheasy):
  `- [Stayput - Browser-only file toolkit using libheif, libjxl and libavif Wasm builds for HEIC, JPEG XL and AVIF decoding; no server.](https://github.com/keenanlk/stayput)`
  One-click link: https://github.com/mbasso/awesome-wasm/edit/master/README.md
- Row 13, **Astro showcase**: not a PR. The actual mechanism (found by
  reading astro.build's own update script) is a URL posted as a comment in
  a GitHub Discussion (withastro/roadmap#521); a weekly bot turns it into a
  PR with screenshots. No form, no Discord needed.
  One-click link: https://github.com/withastro/roadmap/discussions/521
  Comment text: `https://stayput.dev — free, open-source HEIC/PDF/image tools that run entirely in the browser, built with Astro.`
- Row 14, **PWA directories**: skipped. Both appsco.pe and progressiveapp.store
  are unreachable from here (network egress blocks both domains outright), and
  a web search turns up no evidence progressiveapp.store is a live, working
  directory or that appsco.pe still accepts submissions (one source flags
  appsco.pe as no longer active). Not submitting to an unverified target;
  recommend dropping this row unless Keenan checks the sites himself and
  finds a live submission form.

Claude has no working path to open these PRs or post the Discussion comment
under Keenan's own GitHub login from this session, so the draft text and
one-click links above are for Keenan to use directly.
