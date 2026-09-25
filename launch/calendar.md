# Content calendar

The single schedule for everything that gets posted, from account warm-up
through the launch weeks. Claude's Monday routine reads this file, posts the
week's items in the project thread with the text to paste, and ticks lines
here in a small PR when Keenan says they are done. Skipped items roll into the
next week; nothing is posted by Claude.

Rules that apply to every line: disclose that Keenan built it whenever
Stayput is mentioned; never ask for votes; never post the same text twice;
one Stayput link per comment at most, and only where it is the honest answer
next to the native option. Voice per launch/README.md.

Text for launch posts lives in the files it came from (show-hn.md,
product-hunt.md, community.md, directories.md); this file says when.

## Week 1, Mon Sep 28 to Sun Oct 4: accounts and first comments

- [ ] **HN** create `keenanlk`; fill the "about" with one line and the site URL only after Oct 27.
- [ ] **HN** 3 comments (Mon, Wed, Fri). Threads to look for: HEIC/HEIF, JPEG XL or AVIF, PDF tooling, WebAssembly in the browser, "privacy-first" tools, iOS photo workflows. Answer the question; no Stayput mention.
- [ ] **Reddit** confirm or create the account. Join r/privacy, r/degoogle, r/webdev, r/InternetIsBeautiful (targets) and r/iphone, r/techsupport, r/mac, r/windows (Q&A).
- [ ] **Reddit** 3 comments in the Q&A subs answering "how do I open/convert HEIC" and "how do I shrink a PDF" with the native fix. No links this week.
- [ ] **Product Hunt** create the maker account (deadline Fri Oct 3), follow Privacy, Open Source, Productivity, Developer Tools.
- [ ] **Bluesky** create the account, start the domain-handle flow, paste the `did:plc:...` in the thread; Claude opens the `.well-known` PR the same day.
- [ ] **Bluesky** follow: Astro, pdf.js, Squoosh/jSquash maintainers, Privacy Guides, EFF, a few HEIC/photography accounts Claude lists in the Monday reminder.
- [ ] **Bluesky** post 1 (Tue):
  > Building a file toolkit that never uploads anything. HEIC to JPG, PDF merge, compress, sign, EXIF removal, all inside the browser tab. Open the network tab and it stays empty. Launching in October; building it in the open until then.
- [ ] **Namecheap** hello@stayput.dev forwarder and catch-all.
- [ ] **Search Console and Bing** verified, sitemap submitted.

## Week 2, Mon Oct 5 to Sun Oct 11: keep commenting

- [ ] **HN** 3 comments.
- [ ] **Reddit** 3 comments, still no links.
- [ ] **Product Hunt** 1 real comment on someone else's launch.
- [ ] **Bluesky** post 2 (Tue), with launch/assets/04-strip-exif.png:
  > Removing EXIF from a JPEG without re-encoding it: walk the segments, drop APP1/APP2/APP13, copy the rest. Pixels untouched, file smaller, GPS gone. About 600 lines of TypeScript. Write-up coming after launch.
- [ ] **Bluesky** post 3 (Fri), with launch/assets/network-tab.gif:
  > This is the whole pitch. Three HEIC photos, converted, and the network tab shows only the page load.

## Week 3, Mon Oct 12 to Sun Oct 18: first links

- [ ] **HN** 3 comments.
- [ ] **Reddit** 3 comments; one may carry the community.md answer template with the Stayput link if the thread is a HEIC or PDF question and the native option is given too.
- [ ] **Product Hunt** 1 comment.
- [ ] **Bluesky** post 4 (Tue), with 03-sign-pdf.png:
  > Signing a PDF should not mean uploading the contract to someone's server. Draw or type, place, download. The PDF never leaves the tab.
- [ ] **Bluesky** post 5 (Fri):
  > Works offline after one visit: it is a static site with a service worker, so airplane mode is a feature. Convert a hundred photos on a plane.
- [ ] **Claude** demo video recorded (marketing-plan.md section 4).

## Week 4, Mon Oct 19 to Sun Oct 25: soft launch

- [ ] **HN** 3 comments.
- [ ] **Reddit** 3 comments, one link allowed.
- [ ] **Product Hunt** fill the listing from product-hunt.md in PH's scheduler for Tue Nov 3 12:01 am PT; do not submit yet (Claude checks the copy first).
- [ ] **AlternativeTo, Uneed, Peerlist, Privacy Guides forum** accounts created (no submissions yet).
- [ ] **Bluesky** post 6 (Tue), with 01-home.png:
  > Soft launch. stayput.dev is live: 14 free tools for HEIC, images and PDFs that run in your browser and upload nothing. Bugs welcome, especially on phones.
- [ ] **Bluesky** post 7 (Fri):
  > Show HN next Tuesday. If you have a HEIC photo or a big PDF lying around, try it before then and tell me what breaks: stayput.dev
- [ ] **Keenan** OK for the Show HN post and the directory submissions (one message, per checklist.md).

## Week 5, Mon Oct 26 to Sun Nov 1: Show HN

- [ ] **Tue Oct 27, 9:00 am ET** Show HN from show-hn.md, title 1, first comment in the text field. Reply to every top-level comment for two hours, then hourly.
- [ ] **Tue Oct 27, 9:15** AlternativeTo, Privacy Guides forum, Uneed, Peerlist submissions (directories.md rows 2, 5, 6, 7). Claude opens the PRs and forms for rows 1, 3, 4, 8, 9, 13 the same morning.
- [ ] **Tue Oct 27, ~10:00** Bluesky post 8: the HN link in one line, no ask:
  > Stayput is on Show HN today. Convert HEIC and edit PDFs in your browser, nothing uploaded, open source: [HN link]
- [ ] **Wed Oct 28 to Fri Oct 30** DEV.to article (community.md outline; Claude delivers the full text by Oct 26). Bluesky post 9 links it.
- [ ] **Reddit** helpful answers only this week; no posts until after Product Hunt.
- [ ] **Sat Oct 31** Claude posts a one-line HN result summary in the thread (points, comments, visitors from Umami).

## Week 6, Mon Nov 2 to Sun Nov 8: Product Hunt and Reddit

- [ ] **Mon Nov 2, evening** confirm the scheduled Product Hunt listing; maker comment ready.
- [ ] **Tue Nov 3** Product Hunt live 00:01 PT; reply to every comment. Bluesky post 10 links the PH page, one line, no ask. r/degoogle post (community.md).
- [ ] **Wed Nov 4** r/InternetIsBeautiful link post plus first comment.
- [ ] **Fri Nov 6** r/privacy post.
- [ ] **Sat Nov 7** r/webdev Showoff Saturday post. Indie Hackers product page created.
- [ ] **Sun Nov 8** Claude compiles the numbers for the Mon Nov 9 retrospective; the retrospective is posted on Indie Hackers and as Bluesky post 11.

## After Nov 9

The retrospective decides the cadence. Default: one Bluesky post per new tool
(the weekly growth thread ships one), one helpful Reddit or HN answer a week,
and nothing else until the numbers say otherwise.
