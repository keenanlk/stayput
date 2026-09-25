# Launch checklist

Times are US Eastern unless stated. Every "post" line waits for Keenan's
explicit OK in the project and goes out from his account. Everything else
Claude does.

## Blocked until the site is live

- [ ] Vercel import of keenanlk/stayput done and production deploy green (Keenan)
- [ ] stayput.app bought and attached in Vercel (Keenan)
- [ ] `noindex` removed if present; `robots.txt` and sitemap verified at the live URL
- [ ] Search Console property added, sitemap submitted (Keenan verifies with the DNS TXT record)
- [x] GIF and five screenshots made (assets.md); re-check against the live site
- [ ] GitHub Sponsors enabled so the footer link resolves (Keenan; optional for launch)
- [ ] Repo made public (Keenan)

## Soft launch, Tue Oct 20 to Sat Oct 24

- [ ] Every tool run once on iOS Safari, Android Chrome, desktop Chrome and Firefox with real files (a 12 MP HEIC, a 40-page PDF, a 30 MB scan)
- [ ] Lighthouse 95+ on the home page and three tool pages, mobile and desktop
- [ ] All links in launch/ opened once from a phone and once from a desktop
- [ ] Umami receiving events from the live domain; public share link working
- [ ] Dashboard shows "live" and the launch checklist progress
- [ ] Share with a handful of people for bug reports; fix anything found before Tuesday
- [ ] Directory PRs (nologin.tools, awesome-privacy, awesome-wasm) prepared as branches, not opened
- [ ] Ask Keenan for the OK on the Show HN post and the directory submissions (one message, once)

## Show HN day, Tue Oct 27

| Time | Step | Who |
| --- | --- | --- |
| 8:00 | Final smoke test of every tool on the live site; confirm CI is green on main and no deploy is pending | Claude |
| 8:30 | Open the directory PRs and the no-account form submissions (directories.md rows 1, 3, 4, 8, 9, 13, 14) | Claude |
| 9:00 | Post Show HN: title 1, URL, first comment from show-hn.md | Keenan |
| 9:00 to 11:00 | Reply to every top-level comment within minutes; Claude drafts replies from the reply bank as Keenan pastes the questions or a link to the thread | Both |
| 9:15 | Submit AlternativeTo, Privacy Guides forum, Uneed, Peerlist (directories.md rows 2, 5, 6, 7) | Keenan |
| all day | Any bug reported in the thread: reproduce, reply with an ETA, fix, deploy, reply again | Claude fixes, Keenan replies |
| all day | Watch the dashboard: uptime probe, Vercel bandwidth, tool success rate | Claude |
| 17:00 | Tick "Show HN posted" in the ops status; log traffic and comments in the work log | Claude |

## Wed Oct 28 to Fri Oct 30

- [ ] DEV.to write-up published (Claude writes, Keenan posts)
- [ ] Reply to any late HN comments once a day
- [ ] Fix and deploy everything reported during the week
- [ ] Ask Keenan for the OK on the Product Hunt listing and gallery (one message)

## Product Hunt day, Tue Nov 3

| Time (Pacific) | Step | Who |
| --- | --- | --- |
| Mon Nov 2, evening | Listing filled from product-hunt.md, gallery uploaded, scheduled for 12:01 am | Keenan |
| 00:01 | Listing goes live automatically | |
| 06:00 | Post the maker's first comment if the scheduler did not carry it | Keenan |
| 06:00 to 18:00 | Reply to every comment; Claude drafts as needed | Both |
| 06:00 | r/degoogle post (community.md) | Keenan |
| evening | Tick "Product Hunt posted"; log the day | Claude |

## Wed Nov 4 to Sat Nov 7

- [ ] Wed: r/InternetIsBeautiful
- [ ] Fri: r/privacy
- [ ] Sat: r/webdev Showoff Saturday
- [ ] Reply to comments for 48 hours after each
- [ ] Same-day fixes for any bug

## Mon Nov 9: retrospective

- [ ] Numbers from the dashboard: visitors, tool runs, top tools, top referrers, GitHub stars, uptime, tool success rate
- [ ] What each channel produced, ranked
- [ ] Bugs found and fixed
- [ ] The next four tools, from the keyword list
- [ ] Posted in the project; ops status phase set to `launched`
