# Marketing plan

Written 2026-09-25 for the launch window (soft launch Oct 20 to 24, Show HN
Tue Oct 27, Product Hunt Tue Nov 3, Reddit Nov 3 to 7). Every claim below
carries where it came from; where a check could not be run, the plan says so.
Budget is zero: free software and services only. Keenan pays for the domain
and hosting, nothing else.

The one-line version: **search is the channel, Hacker News and Reddit are the
ignition, everything else is a backlink.** Accounts on HN, Reddit and Product
Hunt need four weeks of history before Oct 27, so the account section is the
part to act on this week.

## 1. Where comparable sites get their traffic

Source: Semrush free overview pages, "August 2026 Traffic Stats", fetched
2026-09-25 from the homelab (the cloud sandbox cannot reach Semrush or
Similarweb). Similarweb's free pages returned empty bodies to every fetch;
the Similarweb figures quoted are from Google's cached summary sentences and
are marked as such. Referral, social and mail splits are rendered client-side
on both sites and could not be read, so "rest" below is unknown.

| Site | Visits, Aug 2026 | Google organic | Direct | Note |
| --- | --- | --- | --- | --- |
| ilovepdf.com | 255.46M | 47.28% | 46.14% | 266K visits/month arrive from ChatGPT |
| smallpdf.com | 42.78M | 53.33% | 31.99% | Paid search fell 42.91% month on month; they are cutting ads |
| squoosh.app | 5.47M | 10.35% | 85.44% | 46K from ChatGPT; average session 9:34 |
| tinywow.com | 2.23M | 20.01% | 70.50% | Founder reported 15 to 20K branded searches a day once ranking (LinkedIn) |
| photopea.com | (Similarweb, cached) | 29.85% | 66.38% | Growth came from two Reddit AMAs: 1.5M visits Oct 2018, 3M nine months later, AMA 50K upvotes ([Indie Hackers write-up](https://www.indiehackers.com/post/how-reddit-ama-earned-photopea-12m-monthly-users-7c66c1d9ad)) |
| tools.pdf24.org | (Similarweb, cached) | 2nd | 52.5% | Referrals 3rd |
| ezgif.com | (Similarweb, cached) | 55.06% | 2nd | Organic social is 3rd, the only tool site where social registers |

What the table says:

- Every site in the category is search plus direct, and nothing else registers.
  Direct is returning users typing the name, which is what search brings first.
- The PDF sites (ilovepdf, smallpdf) are half organic search because "merge
  pdf", "compress pdf" and friends are enormous queries. Stayput already has
  14 tools, 23 landing pages and 10 guides aimed at exactly those queries
  (growth/backlog.md), so the plan's main channel is already being built.
- The privacy and developer angle (Squoosh, Photopea) is mostly direct and
  word of mouth. That traffic starts with one big community moment (Squoosh
  was launched on stage at Chrome Dev Summit 2018; Photopea's were Reddit
  AMAs) and then compounds as people come back.
- ChatGPT is now a visible referrer for all four Semrush-covered sites. Being
  in the Bing index is what makes that possible (Bing feeds ChatGPT search and
  Copilot), so Bing Webmaster Tools is not optional.

### Launch channels, what they deliver

| Channel | Evidence | Expected for Stayput |
| --- | --- | --- |
| Show HN, front page | 5,000 to 30,000 unique visitors in 24 hours when it reaches the front page; roughly 1.4 GitHub stars per upvote in 48 hours ([daily.dev summary](https://business.daily.dev/resources/hacker-news-marketing-developer-tools-show-hn-launch-day-sustained-coverage/), [Stackmatix](https://www.stackmatix.com/blog/launching-on-hacker-news)). A developer who launched the same tool on both: HN #2 with 107 points gave 50+ stars; PH #14 with 193 votes gave 10 stars ([Medium](https://medium.com/@baristaGeek/lessons-launching-a-developer-tool-on-hacker-news-vs-product-hunt-and-other-channels-27be8784338b)). Recent precedents in our niche: "Show HN: A fast, privacy-first image converter that runs in browser" ([HN 45693904](https://news.ycombinator.com/item?id=45693904)) and "Show HN: Prism.Tools, free and privacy-focused developer utilities" ([HN 46511469](https://news.ycombinator.com/item?id=46511469)). | Best single day of the year if it lands; a few hundred visitors if it does not. Both outcomes are cheap: the post is drafted. |
| Reddit | Photopea's whole growth story ([Failory interview](https://www.failory.com/interview/photopea)); the founder also says 90% of his early self-promotion comments were removed. Subreddits now gate by karma, account age and Contributor Quality Score ([Signals reference](https://signals.sh/blog/reddit-account-age-minimums-per-subreddit), [SubredditAnalyzer](https://www.subredditanalyzer.com/how-much-karma-do-you-need-to-post-on-reddit)). | The four drafted posts plus ongoing helpful answers in HEIC and PDF threads. Slow and steady, and the one channel where the "network tab stays empty" demo is a video people share. Needs an aged account. |
| Directories and backlinks | AlternativeTo: 4.75M visits a month, DR 82, cited by Perplexity and ChatGPT for "alternative to X" answers ([BuiltByMe 2026 guide](https://builtbyme.io/blog/indie-product-directory-submission-guide-2026)). Free submissions "sit in the backlog for at least a few months" ([launchdirectories](https://launchdirectories.com/directory/alternativeto)). | Small direct traffic, durable links that lift the search channel. One afternoon on Oct 27, already scripted in directories.md. |
| Product Hunt | Featured launches: 1,000 to 5,000 visitors and 10 to 150 signups on the day; not featured: 100 to 500 ([shno.co statistics](https://www.shno.co/marketing-statistics/product-hunt-launch-statistics)). Maker account must be 30+ days old ([LaunchList 2026](https://getlaunchlist.com/blog/how-to-launch-on-product-hunt-2026)). | A backlink and a story to link from the site, not a user channel. Kept because the listing is drafted and costs three hours. |
| DEV.to | One indie CLI got 196 downloads from 22 articles; the posts that worked were the ones with standalone value ([DEV.to post](https://dev.to/gonewx/i-spent-10-days-promoting-my-indie-dev-tool-heres-what-actually-worked-and-what-completely-3fkd)). | The EXIF write-up is a real technical article, so it will do better than a launch announcement, and it earns a link. One post, not a channel. |
| Bluesky | Recommended over Mastodon for developer tools: larger active base, small accounts see 4 to 8% engagement, links are not suppressed ([daily.dev guide](https://business.daily.dev/resources/bluesky-mastodon-developer-marketing-open-social-web/), [UniLink comparison](https://app.unilink.us/blog/mastodon-vs-bluesky-2026)). | Where the demo GIF lives and where launch posts get quoted. Ten minutes a week. |

### Ranked by expected users per hour of Keenan's time

1. **Organic search pages** (Claude's hours, not Keenan's). Every comparable site runs on it. Already automated by the weekly growth thread. Keenan's part: verify Search Console and Bing once (ten minutes).
2. **Show HN** on Oct 27. Four hours on the day replying to comments. The upside is tens of thousands of visitors; the downside is nothing lost.
3. **Reddit**, as helpful answers first and the four posts second. Fifteen minutes three times a week from now until launch, then the four posts. Compounds; Photopea is the existence proof.
4. **Directory submissions** on Oct 27. Two hours once. Backlinks feed channel 1.
5. **Product Hunt** on Nov 3. Three hours once for a backlink and a page to point at.
6. **Bluesky**, ten minutes a week, posting what the calendar says.
7. **DEV.to**, one article in launch week.

### Not worth it, and why

- **X/Twitter.** Links are down-ranked, reach for new accounts is near zero without paying, and @stayput appears taken (x.com answers 200 for that handle and 404 for @stayputdev). No account.
- **Instagram, Threads, TikTok, LinkedIn page, Facebook page.** Audience mismatch for a file tool, and @stayput answers 200 on Instagram and Threads. No accounts. Keenan's personal LinkedIn can share the launch once if he likes; that needs no setup.
- **YouTube channel.** @stayput is taken (200). One demo video is worth making (section 4) but it will be hosted on the site and in the repo; a channel with one video helps nobody.
- **Mastodon as a primary.** Smaller and slower than Bluesky for this audience. If fediverse reach matters later, Bridgy Fed mirrors a Bluesky account for free with no second login ([EFF guide](https://www.eff.org/deeplinks/2026/04/bridge-somewhere-how-link-your-mastodon-bluesky-or-other-federated-accounts)). @stayput is free on fosstodon.org and mastodon.social (API: "Record not found"), so it can be taken later.
- **Indie Hackers as a channel.** Founders, not file-tool users. Worth one product page (free: /product/stayput answers 404) so the Nov 9 retrospective has somewhere to live and a backlink. Nothing more.
- **Slant.** Slant's help page says people with a professional relationship to a product cannot add it to questions, only edit its spec table once someone else lists it. Skip.
- **Newsletters, paid anything, Discord servers, cold outreach to press.** No list, no budget, no story yet. Revisit after the Nov 9 numbers.
- **Buffer, Later, Monday and every scheduling SaaS.** See section 3.

## 2. Accounts to create, in priority order

Handle checks were run 2026-09-25 with HTTP status probes and public APIs from
the homelab (the sandbox blocks most of these hosts). "Free" means a 404 or an
explicit not-found from the API. Reddit blocked every probe from both places,
so nothing on Reddit could be verified.

| # | Account | Handle | Status checked | Why | Do before Oct 27 |
| --- | --- | --- | --- | --- | --- |
| 1 | **Hacker News** | `keenanlk` | HN API returns `null` for both `keenanlk` and `stayput`: neither exists | Show HN is the launch; HN posts from persons, not brands, and a username under two weeks old is shown green ([hacker-news-undocumented](https://github.com/minimaxir/hacker-news-undocumented)). A moderator asks for karma before Show HN in practice, and a green name invites "is this an ad" replies. | Create this week. Comment three times a week on threads about HEIC, PDFs, Wasm, image formats, privacy tooling; answer questions, never mention Stayput before Oct 27. Target 50 or more karma by Oct 27; any account older than two weeks with real comments avoids the green name. Keep it a personal account. |
| 2 | **Reddit** | `keenanlk` (or his existing account if he has one) | Could not check: reddit.com blocked from sandbox and homelab | r/privacy, r/degoogle, r/webdev and r/InternetIsBeautiful gate on account age (two to four weeks), karma (50 or more) and Contributor Quality Score; a new account that posts links is removed automatically. | If an account exists, use it. If not, create this week. Three comments a week in r/iphone, r/techsupport, r/mac, r/windows answering HEIC and PDF questions with the native fix (Preview, Windows HEIF extension, sips); no links for the first two weeks, then at most one Stayput link a week as the community.md template says. Join the four target subreddits now, so the "member since" is old by November. |
| 3 | **Product Hunt** | maker `@keenanlk`, product `stayput` | /products/stayput answers 404 (free); /@stayput answers 403 (could not check) | Maker account must be 30+ days old by Nov 3, so the deadline to create it is **Oct 3**. Hunter follower counts no longer matter; self-hunting is normal. | Create by Oct 3. Once a week: upvote and leave one real comment on a launch in Privacy or Developer Tools. Follow the four topics from product-hunt.md. |
| 4 | **Contact email** | `hello@stayput.dev` | Not an account; Namecheap free email forwarding, available because stayput.dev uses Namecheap DNS ([Namecheap KB](https://www.namecheap.com/support/knowledgebase/article.aspx/308/2214/how-to-set-up-free-email-forwarding/)) | Product Hunt, directories, the press kit, GitHub and the site footer all want a contact that is not a personal Gmail. Forwarding is receive-only; replies go from Gmail, which is fine. | Namecheap → Domain List → Manage stayput.dev → Domain tab → Redirect Email → Add Forwarder: `hello` → his Gmail. Also add a catch-all to the same inbox. Two minutes. Namecheap adds the MX records itself. Tell Claude when done and the footer, press kit and repo get the address. |
| 5 | **Bluesky** | `@stayput.dev` (domain handle) | `stayput.bsky.social` is taken (API resolves to did:plc:faokceynamgiicozzhxg5tuh); `stayputdev.bsky.social` is free; a domain handle is always available to the domain owner | The only social account worth running. Using the domain as the handle is free, verifies ownership, and sidesteps the taken handle. | Create the account with any temporary handle, then Settings → Account → Handle → "I have my own domain" → stayput.dev → choose "No DNS panel" → copy the `did:plc:...` string and paste it in the thread. Claude adds `public/.well-known/atproto-did` to the repo (one PR), Keenan presses Verify. No DNS change. Post the calendar items; follow the accounts listed in calendar.md week 1. |
| 6 | **GitHub** | repo `keenanlk/stayput`; the `stayput` user name is taken (user `stayPut`, id 35615048) | api.github.com/users/stayput answers 200 | The repo is the proof for every claim in the launch copy. It goes public before Oct 27. | Before flipping public: repo description "Convert HEIC and fix PDFs in your browser. Nothing uploaded. Free, open source, works offline.", website stayput.dev, topics (section 4), social preview `public/og.png` uploaded under Settings → Social preview, Discussions on, Sponsors optional. Profile: pin the repo, add a one-line bio and the site link. Claude prepares the repo-side parts (README badges, CONTRIBUTING, CHANGELOG, issue templates already exist) and posts the exact settings text when it is time. |
| 7 | **DEV.to** | `keenanlk` for publishing; `stayput` org name is free (API 404) | dev.to/api/users/by_username?url=stayput → not found | Personal accounts get read; brand accounts on DEV.to do not. One article in launch week, canonical URL pointing at stayput.dev once the site has a blog page. | Create when convenient, before Oct 28. Follow the `privacy`, `webdev` and `webassembly` tags. No warm-up needed. |
| 8 | **Indie Hackers** | product page `stayput` | /product/stayput answers 404 (free) | A backlink and the home for the Nov 9 retrospective, which IH readers do share. | Create in launch week. No warm-up. |
| 9 | **AlternativeTo, Uneed, Peerlist, Privacy Guides forum** | `keenanlk` | AlternativeTo and Peerlist answered 403 to probes, could not check | Needed on Oct 27 for the submissions in directories.md. AlternativeTo's free queue takes months; a listing created on Oct 27 may appear in early 2027, which is fine because the value is the link. | Create the week of Oct 19 so the accounts are not brand new on submission day. |

Not creating, on purpose: X, Instagram, Threads, TikTok, YouTube, LinkedIn
page, Mastodon (see section 1). The "stayput" Mastodon handles are free if
that changes.

### The four aging weeks, week by week (Sep 28 to Oct 25)

The calendar file has the exact items per week. The shape:

| Week | HN | Reddit | Product Hunt | Bluesky |
| --- | --- | --- | --- | --- |
| Sep 28 | Create account. 3 helpful comments. | Create or dust off account, join the 4 target subs and the 4 Q&A subs. 3 helpful comments, no links. | Create maker account (deadline Oct 3). | Create account, set domain handle, follow list, first post. |
| Oct 5 | 3 comments. | 3 comments, no links. | 1 comment on someone's launch. | 2 posts (build in public). |
| Oct 12 | 3 comments. | 3 comments, one may carry a Stayput link if it is the honest answer. | 1 comment. | 2 posts. |
| Oct 19 (soft launch) | 3 comments. | 3 comments, one link allowed. | Draft the listing in PH's scheduler, do not submit. | 2 posts, including the "launching next week" one. |

Fifteen minutes on Monday, Wednesday and Friday covers the HN and Reddit
lines. Claude's Monday reminder (section 3) lists that week's items with
suggested threads found that morning.

## 3. Scheduling and planning: decision

**Decision: the calendar lives in this repo (`launch/calendar.md`), and a
weekly routine reminds Keenan on Monday morning with the week's paste-ready
posts.** No scheduling SaaS.

Why, against the alternatives that were checked:

| Option | What was checked | Verdict |
| --- | --- | --- |
| Repo calendar plus a Claude routine | Nothing to sign up for. Claude edits the file in PRs, the routine reads it every Monday and posts the week's items in the thread with the text to paste. Every post is versioned next to the drafts it came from. | **Chosen.** The channels that matter (HN, Reddit, Product Hunt, directories) cannot be scheduled by any tool; they are posted by hand at a chosen minute. The only schedulable channel is Bluesky at two posts a week. |
| Buffer free plan | 3 channels, 10 queued posts per channel, no time limit ([Buffer pricing](https://buffer.com/pricing), [limits summary](https://postscheduler.in/blog/buffer-free-plan-limits/)). Supports Bluesky and Mastodon. | Not needed. It covers only the Bluesky channel, adds a login, and Claude cannot write to it, so Keenan would be copying from the repo into Buffer and then Buffer would post: one step more than pasting into Bluesky directly. Stays free at our scale if ever wanted. |
| Typefully or Metricool via a Claude connector | Both exist in the connector registry (Typefully: create_draft, schedule; Metricool: createScheduledPost). Typefully's free plan is limited to one X account plus drafts; Metricool's free plan is one brand. | The one way Claude could post to Bluesky itself. Not adopting now: it is a new service needing Keenan's sign-up and a connector, for two posts a week. If Bluesky volume grows after launch, Typefully is the one to ask about. |
| Native scheduling | Bluesky has no scheduling. Reddit removed scheduled posts for regular users. HN has none. Product Hunt schedules the launch listing itself (used on Nov 2). Mastodon schedules only via API. | Used where it exists (Product Hunt). Nothing else to use. |
| Monday, Notion, Trello, Later | Project boards duplicate the ops dashboard, which already shows every card; Later is Instagram-first and paid beyond one account. | Out. |

How the routine works: every Monday at 8:52 am Eastern a routine wakes this
thread. Claude reads `launch/calendar.md`, finds the current week, looks for
two or three live HN and Reddit threads where a helpful comment fits, and
posts one reply here: the week's items, the text to paste for each, and the
links. Keenan replies "done" or with what he skipped; Claude ticks the file in
a small PR and rolls anything skipped into the next week. Posts only ever go
out from Keenan's accounts, because no connector for HN, Reddit or Product
Hunt exists, and the rule is that public posts get his OK.

## 4. Everything else to set up now, for free

| Item | State on 2026-09-25 | What to do | Whose step |
| --- | --- | --- | --- |
| **Google Search Console** | Not added (needs his Google login). Site is live on stayput.dev with a sitemap at /sitemap-index.xml (robots.txt points to it). | Add property "stayput.dev" as a Domain property, verify with the DNS TXT record Google shows (Namecheap Advanced DNS → Add record → TXT @), submit the sitemap. Paste the TXT value in the thread if he prefers Claude to walk him through it. | Keenan, five minutes |
| **Bing Webmaster Tools** | Not added. | bing.com/webmasters → "Import from Google Search Console" (one click once GSC is verified; [Bing help](https://www.bing.com/webmasters/help/refreshed-webmaster-tools-7c7d2533)). Bing's index feeds ChatGPT search and Copilot, which are already a visible referrer for every comparable site. Claude then adds an IndexNow key file to `public/` so every deploy pings Bing ([IndexNow](https://www.bing.com/indexnow)). | Keenan, two minutes; Claude for IndexNow |
| **Uptime monitoring** | Uptime Kuma is already running on the Raspberry Pi (homelab inventory: `uptime-kuma`, up, port 3001), and the ops dashboard probes the site every two minutes. UptimeRobot's free plan is non-commercial only since Oct 2024 and checks from one location; not needed. | Add two monitors in Uptime Kuma: HTTPS `https://stayput.dev/` and keyword `https://stayput.dev/tools/heic-to-jpg` for the word "HEIC", 5-minute interval, notify by whatever Kuma already uses. Public status page optional. | Keenan, three minutes, on the Pi's Kuma UI |
| **Changelog** | None. | `CHANGELOG.md` added in this PR, Keep-a-Changelog format, one entry per merged PR. A `/changelog` page rendered from it is in growth/backlog.md; Product Hunt and HN readers click "what's new" and it is a page search engines revisit. | Claude |
| **Press kit** | None. | `launch/press-kit.md` added in this PR: one-paragraph and one-line descriptions, facts, the six screenshots and GIF, logo files, the "how to verify nothing is uploaded" paragraph, contact. A `/press` page is in the backlog. Directory forms, DEV.to and any journalist get the same words. | Claude |
| **"Open the network tab" demo video** | The 1270x760 GIF exists (launch/assets/network-tab.gif). No video. | Plan: 20 seconds, no voice, captions only. Shot list: 1) drop three HEIC files, 2) DevTools network tab already open on the right, filter "All", 3) files convert, request list stays at the two page loads, 4) toggle airplane mode in DevTools ("Offline"), convert again, 5) end card "Your files stay put. stayput.dev". Claude records it with Playwright's video recorder (WebM, 1280x720, Chromium in the sandbox; no ffmpeg there, so the MP4 for Bluesky and Reddit is made on the homelab with ffmpeg in a follow-up thread). Reddit and Bluesky posts embed the MP4; the site embeds the WebM on the home page under the hero. Optional: two minutes on Keenan's Mac for a real Safari recording with a real iPhone HEIC, which reads as more honest than a headless capture. | Claude, week of Oct 12; Keenan optional |
| **AlternativeTo** | Not listed (probe 403, could not confirm). | Submit Oct 27 per directories.md. Free queue; expect months. Alternatives to list: iLovePDF, Smallpdf, CloudConvert, HEICtoJPG, Squoosh, PDF24, TinyWow, ezgif. | Keenan, Oct 27 |
| **Slant** | Cannot self-submit. | Skip. If a user adds Stayput to "best free PDF tools" questions, edit the spec table then. | Nobody |
| **nologin.tools, awesome-privacy, awesome-wasm, OpenAlternative, Open Source Alternative To, Astro showcase** | In directories.md. | Claude opens the PRs and forms on Oct 27 once the repo is public. | Claude |
| **GitHub topics** | Repo private; topics not set. | When public: `heic`, `heic-to-jpg`, `pdf`, `pdf-tools`, `image-compression`, `exif`, `privacy`, `privacy-tools`, `webassembly`, `pwa`, `offline-first`, `astro`, `client-side`, `no-upload`, `file-converter`, `open-source`. Twenty allowed; these sixteen match the topic pages that get traffic (github.com/topics/privacy-tools, /pdf-tools, /heic). | Keenan, when making the repo public; Claude posts the list again then |
| **GitHub social preview** | Not set. | Upload `public/og.png` (1200x630; GitHub recommends 1280x640 and accepts this) under Settings → Social preview. Without it, shared repo links show a grey avatar card. | Keenan, same moment |
| **GitHub Sponsors** | FUNDING.yml already points at `keenanlk`; Sponsors not enabled. | Optional, already in needs-keenan.md. The footer link 404s until enabled, so either enable it or Claude removes the footer link before launch (Claude will remove it Oct 19 if not enabled, and restore it later). | Keenan, optional |
| **Bluesky domain verification** | Waiting for the DID (account row 5). | Claude adds `public/.well-known/atproto-did` (a text file with the DID) in one PR; Vercel serves it as text/plain. | Claude, after Keenan pastes the DID |
| **Public stats link** | Dropped 2026-09-26: Keenan decided usage numbers stay private. /privacy still says exactly what is measured and why. | Do not link or promise public stats anywhere. | Done |
| **Site footer** | Has GitHub link. | Add hello@stayput.dev and the Bluesky handle once both exist; add "Changelog" and "Press" once the pages exist. | Claude |

## 5. What Keenan does this week, in order

1. Create the Hacker News account `keenanlk` and leave three real comments.
2. Reddit: confirm whether an account exists (Claude could not check); create one if not, join the eight subreddits in calendar.md week 1, three comments.
3. Create the Product Hunt maker account (hard deadline Oct 3).
4. Namecheap: add the `hello@stayput.dev` forwarder and a catch-all (two minutes), then say so in the thread.
5. Bluesky: create the account, start the domain-handle flow, paste the DID in the thread.
6. Google Search Console: add stayput.dev, verify with the TXT record, submit the sitemap; then Bing "Import from Google Search Console".
7. Uptime Kuma on the Pi: two monitors for stayput.dev.

Everything else in this document is Claude's, and the Monday routine will
list the week's comments and posts from Sep 28 onward.

## Measuring it

Umami (public share link above) already records referrers, so on Nov 9 the
retrospective ranks channels by visitors and by tool runs per visitor, using
the utm-free referrer field: news.ycombinator.com, reddit.com,
producthunt.com, bsky.app, dev.to, alternativeto.net, and the search engines.
GitHub stars and the Search Console impressions curve are the other two
numbers. The channel ranking in section 1 gets rewritten from those numbers,
and channels that produced nothing get dropped from the calendar.
